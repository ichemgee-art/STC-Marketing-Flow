import unittest, tempfile, pathlib, sys, json, hashlib
import openpyxl
from openpyxl.comments import Comment
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
from extract_archive import extract

class ArchiveTests(unittest.TestCase):
    def test_preserves_sources_without_guessing_dates(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=pathlib.Path(tmp)/'fixture.xlsx'; b=openpyxl.Workbook();s=b.active;s.title='Tasks'
            s.append(['To','Task Date','Task'])
            s.append(['A','23-9-2026','Copy','=1+1'])
            s.append([None,'23-9','Copy'])
            s.merge_cells('A2:A3');s['C2'].comment=Comment('Keep this note','Original author');s['C2'].hyperlink='https://example.com/file'
            s['A20'].number_format='dd/mm/yyyy';b.save(p);before=p.read_bytes();d=extract(p)
            self.assertEqual(d['source_sha256'],hashlib.sha256(before).hexdigest());self.assertEqual(p.read_bytes(),before)
            self.assertEqual(len(d['rows']),3);self.assertEqual(d['sheets'][0]['max_row'],20)
            r=d['rows'][1];self.assertEqual(r['mapped']['date'],'2026-09-23');self.assertEqual(r['cells']['D2']['value'],'=1+1')
            self.assertEqual(r['cells']['C2']['comment']['text'],'Keep this note');self.assertEqual(r['cells']['C2']['hyperlink']['target'],'https://example.com/file')
            self.assertIsNone(d['rows'][2]['mapped']['date']);self.assertTrue(d['rows'][2]['mapped']['date_issue']);self.assertEqual(d['rows'][2]['mapped']['owner_label'],'A')

if __name__=='__main__': unittest.main()
