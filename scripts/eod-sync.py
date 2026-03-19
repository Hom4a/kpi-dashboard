"""
ЕОД Sync — автоматичне вивантаження звітів з 1С:Підприємство 8.3
та завантаження в KPI Dashboard (Supabase).

Два режими роботи:
  1. COM — підключення до бази 1С через V83.COMConnector (без UI)
  2. UI  — автоматизація інтерфейсу 1С через pywinauto (fallback)

Використання:
  python eod-sync.py              # авторежим (COM → UI fallback)
  python eod-sync.py --mode com   # тільки COM
  python eod-sync.py --mode ui    # тільки UI автоматизація
  python eod-sync.py --date 2026-03-18  # конкретна дата

Встановлення залежностей:
  pip install pywinauto pywin32 requests openpyxl xlrd
"""

import os
import sys
import json
import time
import logging
import argparse
import configparser
from datetime import datetime, timedelta
from pathlib import Path

import requests

# ===== Logging =====
LOG_DIR = Path(__file__).parent
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_DIR / 'eod-sync.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
log = logging.getLogger('eod-sync')

# ===== Config =====
CONFIG_PATH = Path(__file__).parent / 'config.ini'


def load_config():
    if not CONFIG_PATH.exists():
        log.error(f'Config file not found: {CONFIG_PATH}')
        log.info('Create config.ini from config.ini.example')
        sys.exit(1)

    cfg = configparser.ConfigParser()
    cfg.read(str(CONFIG_PATH), encoding='utf-8')
    return cfg


# ===== Supabase Upload =====
def upload_to_supabase(cfg, data_type, period_start, period_end, rows):
    """Upload parsed data to Supabase via Edge Function."""
    url = cfg.get('supabase', 'function_url')

    payload = {
        'type': data_type,
        'period_start': period_start,
        'period_end': period_end,
        'rows': rows
    }

    log.info(f'Uploading {data_type}: {len(rows)} rows for {period_start} — {period_end}')
    resp = requests.post(url, json=payload, headers={
        'Content-Type': 'application/json'
    }, timeout=30)

    if resp.status_code == 200:
        result = resp.json()
        log.info(f'  OK: {result}')
        return True
    else:
        log.error(f'  FAIL ({resp.status_code}): {resp.text}')
        return False


# ===== Parse Excel files =====
def parse_reception_xls(filepath):
    """Parse reception Excel file (same logic as JS parser)."""
    import xlrd
    wb = xlrd.open_workbook(str(filepath))
    ws = wb.sheet_by_index(0)

    period_start, period_end = '', ''
    header_row = -1

    for i in range(min(10, ws.nrows)):
        row_text = ' '.join(str(ws.cell_value(i, j)) for j in range(ws.ncols))
        if 'Початок періоду' in row_text:
            import re
            m = re.search(r'(\d{2})\.(\d{2})\.(\d{4})', row_text)
            if m:
                period_start = f'{m.group(3)}-{m.group(2)}-{m.group(1)}'
        if 'Кінець періоду' in row_text:
            import re
            m = re.search(r'(\d{2})\.(\d{2})\.(\d{4})', row_text)
            if m:
                period_end = f'{m.group(3)}-{m.group(2)}-{m.group(1)}'

    # Find header row
    for i in range(min(15, ws.nrows)):
        cell = str(ws.cell_value(i, 0)).strip().lower()
        if cell == 'лісгосп':
            header_row = i
            break

    if header_row < 0:
        raise ValueError('Header row "Лісгосп" not found')

    # Map columns
    col_map = {'np': -1, 'pv': -1, 'long': -1, 'round': -1, 'total': -1}
    for j in range(ws.ncols):
        h = str(ws.cell_value(header_row, j)).lower().strip()
        if 'дров' in h and 'нп' in h:
            col_map['np'] = j
        elif 'дров' in h and 'пв' in h:
            col_map['pv'] = j
        elif 'довгомір' in h:
            col_map['long'] = j
        elif 'круглі' in h or 'кругл' in h:
            col_map['round'] = j
        elif h == 'разом':
            col_map['total'] = j

    # Parse data rows
    OFFICE_MAP = {
        'карпатськ': 'Карпатська ЛО', 'південн': 'Південна ЛО',
        'північн': 'Північна ЛО', 'подільськ': 'Подільська ЛО',
        'поліськ': 'Поліська ЛО', 'слобожанськ': 'Слобожанська ЛО',
        'столичн': 'Столична ЛО', 'центральн': 'Центральна ЛО',
        'східн': 'Східна ЛО'
    }

    rows = []
    for i in range(header_row + 2, ws.nrows):
        name = str(ws.cell_value(i, 0)).strip()
        if not name or 'разом' in name.lower():
            continue

        office = None
        for key, canonical in OFFICE_MAP.items():
            if key in name.lower():
                office = canonical
                break
        if not office:
            continue

        def num(col_idx):
            if col_idx < 0:
                return 0
            v = ws.cell_value(i, col_idx)
            try:
                return round(float(v), 3) if v else 0
            except (ValueError, TypeError):
                return 0

        rows.append({
            'regional_office': office,
            'firewood_np_m3': num(col_map['np']),
            'firewood_pv_m3': num(col_map['pv']),
            'long_timber_m3': num(col_map['long']),
            'round_timber_m3': num(col_map['round']),
            'total_m3': num(col_map['total'])
        })

    return period_start, period_end, rows


def parse_sales_xls(filepath):
    """Parse sales Excel file."""
    import xlrd
    wb = xlrd.open_workbook(str(filepath))
    ws = wb.sheet_by_index(0)

    period_start, period_end = '', ''
    header_row = -1

    for i in range(min(10, ws.nrows)):
        row_text = ' '.join(str(ws.cell_value(i, j)) for j in range(ws.ncols))
        if 'Початок періоду' in row_text:
            import re
            m = re.search(r'(\d{2})\.(\d{2})\.(\d{4})', row_text)
            if m:
                period_start = f'{m.group(3)}-{m.group(2)}-{m.group(1)}'
        if 'Кінець періоду' in row_text:
            import re
            m = re.search(r'(\d{2})\.(\d{2})\.(\d{4})', row_text)
            if m:
                period_end = f'{m.group(3)}-{m.group(2)}-{m.group(1)}'

    for i in range(min(15, ws.nrows)):
        if str(ws.cell_value(i, 0)).strip().lower() == 'лісгосп':
            header_row = i
            break

    if header_row < 0:
        raise ValueError('Header row "Лісгосп" not found')

    # Map sub-header columns
    col_vol, col_price, col_amount = -1, -1, -1
    for j in range(ws.ncols):
        h = str(ws.cell_value(header_row + 1, j)).lower().strip()
        if "об'єм" in h or 'обєм' in h:
            col_vol = j
        elif 'ціна' in h:
            col_price = j
        elif 'сума' in h:
            col_amount = j

    OFFICE_MAP = {
        'карпатськ': 'Карпатська ЛО', 'південн': 'Південна ЛО',
        'північн': 'Північна ЛО', 'подільськ': 'Подільська ЛО',
        'поліськ': 'Поліська ЛО', 'слобожанськ': 'Слобожанська ЛО',
        'столичн': 'Столична ЛО', 'центральн': 'Центральна ЛО',
        'східн': 'Східна ЛО'
    }

    rows = []
    for i in range(header_row + 2, ws.nrows):
        name = str(ws.cell_value(i, 0)).strip()
        if not name or 'разом' in name.lower():
            continue

        office = None
        for key, canonical in OFFICE_MAP.items():
            if key in name.lower():
                office = canonical
                break
        if not office:
            continue

        def num(col_idx):
            if col_idx < 0:
                return 0
            v = ws.cell_value(i, col_idx)
            try:
                return round(float(v), 2) if v else 0
            except (ValueError, TypeError):
                return 0

        rows.append({
            'regional_office': office,
            'volume_m3': num(col_vol),
            'avg_price_uah': num(col_price),
            'amount_excl_vat': num(col_amount)
        })

    return period_start, period_end, rows


# ===== UI Automation (pywinauto) =====
def run_ui_mode(cfg, target_date=None):
    """Automate 1C UI to generate and export reports."""
    try:
        from pywinauto import Application, Desktop
        from pywinauto.keyboard import send_keys
        from pywinauto.timings import wait_until
    except ImportError:
        log.error('pywinauto not installed. Run: pip install pywinauto')
        return False

    exe_path = cfg.get('1c', 'exe_path')
    base_path = cfg.get('1c', 'base_path', fallback='')
    username = cfg.get('1c', 'username')
    password = cfg.get('1c', 'password')
    output_dir = Path(cfg.get('1c', 'output_dir', fallback=str(LOG_DIR / 'exports')))
    output_dir.mkdir(parents=True, exist_ok=True)

    if not target_date:
        target_date = (datetime.now() - timedelta(days=1)).strftime('%d.%m.%Y')

    log.info(f'UI mode: launching 1C, date={target_date}')

    # Launch 1C
    launch_cmd = f'"{exe_path}" ENTERPRISE'
    if base_path:
        launch_cmd += f' /IBName "{base_path}"'

    try:
        app = Application(backend='uia').start(launch_cmd, timeout=30)
    except Exception as e:
        log.error(f'Failed to start 1C: {e}')
        return False

    try:
        # Wait for login window
        log.info('Waiting for login window...')
        login_dlg = app.window(title_re='.*Доступ до інформаційної бази.*', timeout=30)
        login_dlg.wait('visible', timeout=30)

        # Enter credentials
        login_dlg.child_window(title='Користувач:').parent().children()[1].set_text(username)
        login_dlg.child_window(title='Пароль:').parent().children()[1].set_text(password)
        login_dlg.child_window(title='OK').click()
        time.sleep(5)

        # Main window
        log.info('Waiting for main window...')
        main_win = app.window(title_re='.*ЕОД.*1С.*', timeout=60)
        main_win.wait('visible', timeout=60)

        success = True

        # Generate and save both reports
        for report_name, report_type, filename in [
            ('Приймання лісопродукції', 'reception', 'reception.xls'),
            ('Реалізація лісопродукції', 'sales', 'sales.xls')
        ]:
            log.info(f'Generating report: {report_name}')

            # Click "Лісозаготівля" tab
            main_win.child_window(title='Лісозаготівля').click_input()
            time.sleep(2)

            # Find and click the report link
            main_win.child_window(title_re=f'.*{report_name}.*').click_input()
            time.sleep(3)

            # Set period
            report_win = app.window(title_re=f'.*{report_name}.*', timeout=15)
            report_win.wait('visible', timeout=15)

            # Click period button (...)
            report_win.child_window(title='...').click_input()
            time.sleep(2)

            # Period dialog
            period_dlg = app.window(title_re='.*Виберіть період.*', timeout=10)
            period_dlg.wait('visible', timeout=10)

            # Select "Вчора"
            period_dlg.child_window(title='Вчора').click_input()
            time.sleep(1)
            period_dlg.child_window(title='Вибрати').click_input()
            time.sleep(2)

            # Click "Сформувати"
            report_win.child_window(title='Сформувати').click_input()
            log.info('  Waiting for report generation...')
            time.sleep(10)

            # Save as Excel: Всі дії → В Excel
            report_win.child_window(title='В Excel').click_input()
            time.sleep(3)

            # Save dialog
            save_dlg = app.window(title_re='.*Збереження файлу.*', timeout=10)
            save_dlg.wait('visible', timeout=10)

            filepath = output_dir / filename
            save_dlg.child_window(title='Ім\'я файлу:').parent().children()[-1].set_text(str(filepath))

            # Set file type to Excel if needed
            save_dlg.child_window(title='Зберегти').click_input()
            time.sleep(3)

            # Close report tab
            send_keys('^{F4}')
            time.sleep(2)

            log.info(f'  Saved: {filepath}')

        # Close 1C
        send_keys('%{F4}')
        time.sleep(2)

        # Parse and upload files
        for report_type, filename, parser in [
            ('reception', 'reception.xls', parse_reception_xls),
            ('sales', 'sales.xls', parse_sales_xls)
        ]:
            filepath = output_dir / filename
            if filepath.exists():
                try:
                    ps, pe, rows = parser(filepath)
                    if rows:
                        upload_to_supabase(cfg, report_type, ps, pe, rows)
                    else:
                        log.warning(f'No data rows in {filename}')
                except Exception as e:
                    log.error(f'Parse error {filename}: {e}')
                    success = False
            else:
                log.error(f'File not found: {filepath}')
                success = False

        return success

    except Exception as e:
        log.error(f'UI automation error: {e}')
        # Try to close 1C gracefully
        try:
            send_keys('%{F4}')
        except:
            pass
        return False


# ===== COM Mode =====
def run_com_mode(cfg, target_date=None):
    """Connect to 1C via COM and extract data directly."""
    try:
        import win32com.client
    except ImportError:
        log.error('pywin32 not installed. Run: pip install pywin32')
        return False

    server = cfg.get('1c', 'com_server', fallback='')
    base = cfg.get('1c', 'com_base', fallback='')
    username = cfg.get('1c', 'username')
    password = cfg.get('1c', 'password')

    if not server or not base:
        log.error('COM connection requires [1c] com_server and com_base in config.ini')
        return False

    if not target_date:
        yesterday = datetime.now() - timedelta(days=1)
        target_date = yesterday.strftime('%Y%m%d')

    log.info(f'COM mode: connecting to {server}/{base}')

    try:
        connector = win32com.client.Dispatch('V83.COMConnector')
        conn_string = f'Srvr="{server}";Ref="{base}";Usr="{username}";Pwd="{password}"'
        conn = connector.Connect(conn_string)
        log.info('Connected to 1C via COM')

        # ====================================================================
        # УВАГА: Наступний код потребує знання метаданих конкретної конфігурації.
        # Назви регістрів, документів та реквізитів треба з'ясувати в Конфігураторі.
        #
        # Приклад запиту (потребує адаптації під реальну конфігурацію):
        # ====================================================================

        query = conn.NewObject('Запит')

        # Запит для приймання (ПРИКЛАД — адаптувати під реальні метадані)
        query.Text = '''
        ВЫБРАТЬ
            Лісгосп.Наименование КАК Лісгосп,
            СУММА(Обєм) КАК Обєм
        ИЗ
            РегістрНакопичення.ПриймальнийАкт.Обороти(
                &ДатаПочатку, &ДатаКінця, , )
        ЗГРУПУВАТИ ПО
            Лісгосп.Наименование
        '''

        # Встановити параметри
        # query.SetParameter('ДатаПочатку', ...)
        # query.SetParameter('ДатаКінця', ...)

        log.warning('COM query requires metadata names specific to your 1C configuration.')
        log.warning('Please update the query in eod-sync.py after checking metadata in Конфігуратор.')

        conn = None
        return False

    except Exception as e:
        log.error(f'COM connection failed: {e}')
        log.info('Hint: Ensure V83.COMConnector is registered (run 1C installer with /regserver)')
        return False


# ===== Main =====
def main():
    parser = argparse.ArgumentParser(description='ЕОД → KPI Dashboard sync')
    parser.add_argument('--mode', choices=['auto', 'com', 'ui'], default='auto',
                        help='Режим: auto (COM → UI), com, ui')
    parser.add_argument('--date', help='Дата звіту (YYYY-MM-DD), за замовчуванням — вчора')
    args = parser.parse_args()

    log.info('=' * 50)
    log.info(f'ЕОД Sync started, mode={args.mode}')

    cfg = load_config()

    target_date = args.date

    success = False

    if args.mode in ('auto', 'com'):
        log.info('Trying COM mode...')
        success = run_com_mode(cfg, target_date)

    if not success and args.mode in ('auto', 'ui'):
        log.info('Trying UI automation mode...')
        success = run_ui_mode(cfg, target_date)

    if success:
        log.info('Sync completed successfully')
    else:
        log.error('Sync failed')
        sys.exit(1)


if __name__ == '__main__':
    main()
