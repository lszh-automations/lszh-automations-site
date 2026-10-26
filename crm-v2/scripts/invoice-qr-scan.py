#!/usr/bin/env python3
"""Synthetic invoice PDF print-layout preflight (SIX IG v2.3, ch. 3 and 6).
Independent PDF renderer and optical QR decoder. No bank or customer access.
"""
import sys
import fitz
import cv2
import numpy as np

MM=72/25.4
SHEET_WIDTH=210*MM
SHEET_HEIGHT=297*MM
RECEIPT_WIDTH=62*MM
PAYMENT_HEIGHT=105*MM
QR_SIZE=46*MM
QR_X=RECEIPT_WIDTH+19
QR_Y_BOTTOM=87

def near(a,b,tol=1.0):
    return abs(a-b)<=tol

def printed_line_exists(page,axis,position,minimum_length):
    for drawing in page.get_drawings():
        for item in drawing['items']:
            if item[0]!='l': continue
            p,q=item[1:3]
            if axis=='horizontal':
                if near(p.y,position,.7) and near(q.y,position,.7) and abs(q.x-p.x)>minimum_length:
                    return True
            elif near(p.x,position,.7) and near(q.x,position,.7) and abs(q.y-p.y)>minimum_length:
                return True
    return False

def verify(filename, expected_amount='499.90', multi=False):
    doc=fitz.open(filename)
    assert doc.page_count>=2 if multi else doc.page_count==1, 'unexpected pagination'
    for page in doc:
        assert near(page.rect.width,SHEET_WIDTH,.1) and near(page.rect.height,SHEET_HEIGHT,.1), 'not A4'
    page=doc[-1]
    lines=page.get_text()
    for expected in ('Rechnung', 'Keine MWST', 'Zahlteil', 'Empfangsschein',
                     'Währung', 'Zusätzliche Informationen', 'CH93 0076 2011 6238 5295 7'):
        assert expected in lines, f'visible field missing: {expected}'
    assert lines.count('Zahlteil')==1 and lines.count('Empfangsschein')==1
    assert 'Rechnung RE-1000' in lines, 'unstructured payment message'
    # Page-sized payment part = 210x105mm; vertical receipt separator = 62mm.
    assert printed_line_exists(page,'horizontal',SHEET_HEIGHT-PAYMENT_HEIGHT,SHEET_WIDTH-3), 'top cut line not at 105mm'
    assert printed_line_exists(page,'vertical',RECEIPT_WIDTH,PAYMENT_HEIGHT-3), 'receipt cut line not at 62mm'
    qr_box=fitz.Rect(QR_X,SHEET_HEIGHT-(QR_Y_BOTTOM+QR_SIZE),
                     QR_X+QR_SIZE,SHEET_HEIGHT-QR_Y_BOTTOM)
    quiet=qr_box+(-5*MM,-5*MM,5*MM,5*MM)
    for word in page.get_text('words'):
        box=fitz.Rect(word[:4])
        assert not box.intersects(quiet), f'visible text violates QR 5mm quiet area: {word[4]}'
    # Invoice content must not cross into the A6 payment area or sit on the trim line.
    for word in page.get_text('words'):
        if word[4]=='Zahlbar' and near(word[0],46,2.5) and word[1]<SHEET_HEIGHT-PAYMENT_HEIGHT:
            assert word[3] <= SHEET_HEIGHT-PAYMENT_HEIGHT-5*MM, 'invoice due note too close to cut line'
    for earlier in doc[:-1]:
        text=earlier.get_text()
        assert 'Zahlteil' not in text and 'Empfangsschein' not in text, 'duplicate payment slip'
    # Every scissors icon consists of two 5pt circles. pdf-lib.drawEllipse uses
    # xScale/yScale, NOT width/height. If these are omitted its default 100pt
    # radii create giant 200pt loops obscuring the invoice (real RE-1001 defect).
    curves=[drawing for drawing in page.get_drawings()
            if any(item[0]=='c' for item in drawing['items'])]
    assert len(curves)==4, f'expected four tiny scissors circles, got {len(curves)}'
    for drawing in curves:
        rect=drawing['rect']
        assert rect.width<=6 and rect.height<=6, (
            f'oversized scissors curve {rect.width:.1f}x{rect.height:.1f}pt')
        assert rect.y0>=SHEET_HEIGHT-PAYMENT_HEIGHT-20, 'scissors overlap invoice body'
        # Independently scan the rendered PDF, not just the payload fed to the JS generator.
    pix=page.get_pixmap(matrix=fitz.Matrix(3,3),alpha=False)
    pixels=np.frombuffer(pix.samples,dtype=np.uint8).reshape(pix.height,pix.width,pix.n)
    crop=max(0,int(pix.height-PAYMENT_HEIGHT*3)-16)
    bottom=pixels[crop:,:,:3].copy()
    detector=cv2.QRCodeDetector()
    decoded,points,_=detector.detectAndDecode(bottom)
    if not decoded:
        decoded,points,_=detector.detectAndDecode(cv2.cvtColor(bottom,cv2.COLOR_RGB2GRAY))
    assert decoded and points is not None, 'PDF Swiss QR not optically decodable'
    fields=decoded.splitlines()
    assert len(fields)==31, f'expected 31 fields, got {len(fields)}'
    assert fields[:4]==['SPC','0200','1','CH9300762011623852957']
    assert fields[4:11]==['S','LSZH Invest GmbH','Rummelmatt','8','5610','Wohlen','CH']
    assert fields[18:20]==[expected_amount,'CHF']
    assert fields[27:]==['NON','','Rechnung RE-1000','EPD']
    found=points.reshape(-1,2)
    measured_x=found[:,0].min()/3
    measured_y=(found[:,1].min()+crop)/3
    measured_w=(found[:,0].max()-found[:,0].min())/3
    measured_h=(found[:,1].max()-found[:,1].min())/3
    assert near(measured_x,qr_box.x0,5) and near(measured_y,qr_box.y0,5), 'QR positioned incorrectly'
    assert near(measured_w,QR_SIZE,5) and near(measured_h,QR_SIZE,5), 'QR not approximately 46x46mm'
    print(f'PASS {filename}: {doc.page_count}x A4; 210x105mm part; 62mm receipt; optical QR {measured_w/MM:.2f}x{measured_h/MM:.2f}mm; 5mm whitespace; 31 fields; CHF {expected_amount}; NON; IBAN groups; correct invoice/QR pagination')

if __name__=='__main__':
    verify(sys.argv[1] if len(sys.argv)>1 else 'crm-v2/out/TEST_ONLY_LSZH_Swiss_QR.pdf')
    verify('crm-v2/out/TEST_ONLY_LSZH_Swiss_QR_LONG.pdf','120.00',multi=True)
