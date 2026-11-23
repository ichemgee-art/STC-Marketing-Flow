"""Read-only XLSX extraction. Original workbook is retained byte-for-byte. No credentials.
Usage: python scripts/extract_archive.py workbook.xlsx private-import
"""
import sys, json, hashlib, pathlib, datetime, re, shutil
import openpyxl

def encode(value):
    if isinstance(value,(datetime.datetime,datetime.date,datetime.time)): return value.isoformat()
    if isinstance(value, (str,int,float,bool)) or value is None: return value
    return str(value)

def date_value(value):
    if isinstance(value,(datetime.datetime,datetime.date)): return value.date().isoformat() if isinstance(value,datetime.datetime) else value.isoformat()
    if isinstance(value,str):
        for fmt in ('%d-%m-%Y','%d/%m/%Y','%Y-%m-%d'):
            try: return datetime.datetime.strptime(value.strip(),fmt).date().isoformat()
            except ValueError: pass
    return None

def extract(source):
    raw=source.read_bytes(); sha=hashlib.sha256(raw).hexdigest()
    book=openpyxl.load_workbook(source,data_only=False)
    cached=openpyxl.load_workbook(source,data_only=True)
    rows=[]; sheets=[]; candidates={}
    for sheet in book:
        info={'name':sheet.title,'index':book.sheetnames.index(sheet.title),'max_row':sheet.max_row,'max_column':sheet.max_column,'state':sheet.sheet_state,'merged':list(map(str,sheet.merged_cells.ranges)),'freeze_panes':str(sheet.freeze_panes),'rows':0}
        for cells in sheet.iter_rows():
            saved={}
            for c in cells:
                if c.value is None and not c.comment and not c.hyperlink: continue
                saved[c.coordinate]={'value':encode(c.value),'type':c.data_type,'number_format':c.number_format,'cached_value':encode(cached[sheet.title][c.coordinate].value),
                    'comment':{'text':c.comment.text,'author':c.comment.author} if c.comment else None,
                    'hyperlink':{'target':c.hyperlink.target,'location':c.hyperlink.location,'tooltip':c.hyperlink.tooltip,'display':c.hyperlink.display} if c.hyperlink else None}
            if not saved: continue
            n=cells[0].row
            def val(col): return sheet[f'{col}{n}'].value
            if sheet.title=='Tasks': owner,title,dt,status=val('A'),val('C'),val('B'),val('D')
            elif sheet.title=='Fatma': owner,title,dt,status='Fatma',val('C'),val('A'),val('G')
            else: owner,title,dt,status=sheet.title.replace('2',''),val('B'),val('A'),val('D') if sheet.title=='Fatma2' else val('C')
            inherited={}
            # Only inherit from actual merged ranges, never forward-fill unrelated blanks.
            for merged in sheet.merged_cells.ranges:
                if merged.min_row <= n <= merged.max_row:
                    anchor=sheet.cell(merged.min_row,merged.min_col)
                    inherited[str(merged)]={'anchor':anchor.coordinate,'value':encode(anchor.value)}
                    if merged.min_col==1:
                        if sheet.title=='Tasks' and owner is None: owner=anchor.value
                        elif sheet.title!='Tasks' and dt is None: dt=anchor.value
            mapped={'owner_label':encode(owner),'title':encode(title),'source_date':encode(dt),'date':date_value(dt),'source_status':encode(status),'merged_context':inherited,'date_issue': bool(dt and not date_value(dt))}
            normalized=re.sub(r'\s+',' ',str(title or '').strip().casefold())
            fp=hashlib.sha256(json.dumps([str(owner or '').casefold(),mapped['date'] or str(dt or ''),normalized],ensure_ascii=False).encode()).hexdigest()
            record={'sheet':sheet.title,'row_number':n,'cells':saved,'mapped':mapped,'fingerprint':fp}
            rows.append(record); info['rows']+=1
            if normalized and normalized not in ('task','design idea','  design idea'): candidates.setdefault(fp,[]).append({'sheet':sheet.title,'row':n})
        sheets.append(info)
    duplicates=[v for v in candidates.values() if len(v)>1]
    return {'format_version':1,'source_name':source.name,'source_sha256':sha,'sheets':sheets,'rows':rows,'duplicate_candidates':duplicates}

if __name__=='__main__':
    source=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); out.mkdir(parents=True,exist_ok=True)
    data=extract(source)
    shutil.copy2(source,out/'original.xlsx')
    (out/'archive.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
    summary={k:v for k,v in data.items() if k not in ('rows','duplicate_candidates')}
    summary['record_count']=len(data['rows']); summary['duplicate_candidate_groups']=len(data['duplicate_candidates'])
    (out/'reconciliation.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')
    assert hashlib.sha256((out/'original.xlsx').read_bytes()).hexdigest()==data['source_sha256']
    print(json.dumps(summary,ensure_ascii=True,indent=2))
