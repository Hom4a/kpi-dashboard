"""
ЕОД Sync — парсинг звітів з 1С та завантаження в KPI Dashboard (Supabase).

Режими:
  python eod-sync.py --file report.xls          # парсити один файл
  python eod-sync.py --folder C:\ЕОД_Звіти      # парсити всі .xls в папці
  python eod-sync.py --watch C:\ЕОД_Звіти       # моніторити папку (фоновий режим)

Залежності:
  pip install requests xlrd
"""

import os
import sys
import json
import time
import shutil
import logging
import argparse
import configparser
from datetime import datetime
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
        log.error(f'Config not found: {CONFIG_PATH}')
        sys.exit(1)
    cfg = configparser.ConfigParser()
    cfg.read(str(CONFIG_PATH), encoding='utf-8')
    return cfg


# ===== Detect file type =====
def detect_type(filepath):
    """Detect if file is reception or sales report."""
    import xlrd
    wb = xlrd.open_workbook(str(filepath))
    ws = wb.sheet_by_index(0)

    for i in range(min(10, ws.nrows)):
        row_text = ' '.join(str(ws.cell_value(i, j)) for j in range(ws.ncols)).lower()
        if 'приймання лісопродукції' in row_text:
            return 'reception'
        if 'реалізація лісопродукції' in row_text:
            return 'sales'
    return None


# ===== Parse Excel files =====
def parse_reception_xls(filepath):
    """Parse reception Excel file."""
    import re
    import xlrd
    wb = xlrd.open_workbook(str(filepath))
    ws = wb.sheet_by_index(0)

    period_start, period_end = '', ''
    header_row = -1

    for i in range(min(10, ws.nrows)):
        row_text = ' '.join(str(ws.cell_value(i, j)) for j in range(ws.ncols))
        if 'Початок періоду' in row_text:
            m = re.search(r'(\d{2})\.(\d{2})\.(\d{4})', row_text)
            if m:
                period_start = f'{m.group(3)}-{m.group(2)}-{m.group(1)}'
        if 'Кінець періоду' in row_text:
            m = re.search(r'(\d{2})\.(\d{2})\.(\d{4})', row_text)
            if m:
                period_end = f'{m.group(3)}-{m.group(2)}-{m.group(1)}'

    for i in range(min(15, ws.nrows)):
        cell = str(ws.cell_value(i, 0)).strip().lower()
        if cell == 'лісгосп':
            header_row = i
            break

    if header_row < 0:
        raise ValueError('Header row "Лісгосп" not found')

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
    import re
    import xlrd
    wb = xlrd.open_workbook(str(filepath))
    ws = wb.sheet_by_index(0)

    period_start, period_end = '', ''
    header_row = -1

    for i in range(min(10, ws.nrows)):
        row_text = ' '.join(str(ws.cell_value(i, j)) for j in range(ws.ncols))
        if 'Початок періоду' in row_text:
            m = re.search(r'(\d{2})\.(\d{2})\.(\d{4})', row_text)
            if m:
                period_start = f'{m.group(3)}-{m.group(2)}-{m.group(1)}'
        if 'Кінець періоду' in row_text:
            m = re.search(r'(\d{2})\.(\d{2})\.(\d{4})', row_text)
            if m:
                period_end = f'{m.group(3)}-{m.group(2)}-{m.group(1)}'

    for i in range(min(15, ws.nrows)):
        if str(ws.cell_value(i, 0)).strip().lower() == 'лісгосп':
            header_row = i
            break

    if header_row < 0:
        raise ValueError('Header row "Лісгосп" not found')

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


# ===== Upload to Supabase =====
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


# ===== Process a single file =====
def process_file(cfg, filepath):
    """Detect type, parse, and upload a single file."""
    filepath = Path(filepath)
    if not filepath.exists():
        log.error(f'File not found: {filepath}')
        return False

    log.info(f'Processing: {filepath.name}')

    file_type = detect_type(filepath)
    if not file_type:
        log.warning(f'  Unknown file type, skipping: {filepath.name}')
        return False

    log.info(f'  Detected: {file_type}')

    try:
        if file_type == 'reception':
            ps, pe, rows = parse_reception_xls(filepath)
        else:
            ps, pe, rows = parse_sales_xls(filepath)

        if not rows:
            log.warning(f'  No data rows found in {filepath.name}')
            return False

        return upload_to_supabase(cfg, file_type, ps, pe, rows)

    except Exception as e:
        log.error(f'  Error processing {filepath.name}: {e}')
        return False


# ===== Watch mode =====
def watch_folder(cfg, watch_dir, archive_dir=None):
    """Monitor folder for new .xls files and process them."""
    watch_dir = Path(watch_dir)
    watch_dir.mkdir(parents=True, exist_ok=True)

    if archive_dir is None:
        archive_dir = watch_dir / 'archive'
    else:
        archive_dir = Path(archive_dir)
    archive_dir.mkdir(parents=True, exist_ok=True)

    processed = set()
    log.info(f'Watching folder: {watch_dir}')
    log.info(f'Archive folder: {archive_dir}')
    log.info('Press Ctrl+C to stop')

    while True:
        try:
            for f in sorted(watch_dir.glob('*.xls')):
                if f.name.startswith('~') or f.name.startswith('.'):
                    continue
                key = (f.name, f.stat().st_size, f.stat().st_mtime)
                if key in processed:
                    continue

                # Wait a moment to ensure file is fully written
                time.sleep(2)

                ok = process_file(cfg, f)
                processed.add(key)

                if ok:
                    # Move to archive
                    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
                    dest = archive_dir / f'{ts}_{f.name}'
                    shutil.move(str(f), str(dest))
                    log.info(f'  Archived: {dest.name}')

            # Also check .xlsx files
            for f in sorted(watch_dir.glob('*.xlsx')):
                if f.name.startswith('~') or f.name.startswith('.'):
                    continue
                key = (f.name, f.stat().st_size, f.stat().st_mtime)
                if key in processed:
                    continue

                time.sleep(2)
                ok = process_file(cfg, f)
                processed.add(key)

                if ok:
                    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
                    dest = archive_dir / f'{ts}_{f.name}'
                    shutil.move(str(f), str(dest))
                    log.info(f'  Archived: {dest.name}')

        except KeyboardInterrupt:
            log.info('Watch stopped by user')
            break
        except Exception as e:
            log.error(f'Watch error: {e}')

        time.sleep(30)


# ===== Main =====
def main():
    parser = argparse.ArgumentParser(description='ЕОД → KPI Dashboard sync')
    parser.add_argument('--file', help='Парсити один файл')
    parser.add_argument('--folder', help='Парсити всі .xls/.xlsx в папці')
    parser.add_argument('--watch', help='Моніторити папку (фоновий режим)')
    args = parser.parse_args()

    if not any([args.file, args.folder, args.watch]):
        parser.print_help()
        print('\nПриклади:')
        print('  python eod-sync.py --file report.xls')
        print('  python eod-sync.py --folder C:\\ЕОД_Звіти')
        print('  python eod-sync.py --watch C:\\ЕОД_Звіти')
        sys.exit(0)

    log.info('=' * 50)
    cfg = load_config()

    if args.file:
        log.info(f'Mode: single file — {args.file}')
        ok = process_file(cfg, args.file)
        sys.exit(0 if ok else 1)

    if args.folder:
        log.info(f'Mode: folder scan — {args.folder}')
        folder = Path(args.folder)
        if not folder.exists():
            log.error(f'Folder not found: {folder}')
            sys.exit(1)

        files = list(folder.glob('*.xls')) + list(folder.glob('*.xlsx'))
        files = [f for f in files if not f.name.startswith('~')]
        log.info(f'Found {len(files)} files')

        success = 0
        for f in files:
            if process_file(cfg, f):
                success += 1

        log.info(f'Done: {success}/{len(files)} files uploaded')
        sys.exit(0 if success > 0 else 1)

    if args.watch:
        log.info(f'Mode: watch — {args.watch}')
        watch_folder(cfg, args.watch)


if __name__ == '__main__':
    main()
