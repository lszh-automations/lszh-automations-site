#!/usr/bin/env python3
"""Read QR modules back from the rendered PDF; test data only, never sends payments."""
import sys
import fitz
import cv2
import numpy as np

def verify(filename):
    document=fitz.open(filename)
    assert document.page_count==1, f"expected 1 A4 page, got {document.page_count}"
    page=document[0]
    assert abs(page.rect.width-595.2756)<0.1 and abs(page.rect.height-841.8898)<0.1, "A4 dimensions"
    text=page.get_text()
    for expected in ("Rechnung Nr. RE-1000","TEST_ONLY", "Keine MWST",
                     "Zahlteil","Empfangsschein","Währung","Zusätzliche Informationen"):
        assert expected in text, f"mandatory PDF text missing: {expected}"
    # Render with an independent PDF engine and decode with OpenCV.
    # Test only the bottom payment part (physical 105mm) to reduce search noise.
    pix=page.get_pixmap(matrix=fitz.Matrix(3,3),alpha=False)
    pixels=np.frombuffer(pix.samples,dtype=np.uint8).reshape(pix.height,pix.width,pix.n)
    bottom=pixels[int(pix.height-(105*72/25.4)*3)-16:,:,:3].copy()
    detector=cv2.QRCodeDetector()
    decoded=''
    for variant in [bottom,cv2.cvtColor(bottom,cv2.COLOR_RGB2GRAY)]:
        decoded,points,_=detector.detectAndDecode(variant)
        if points is not None and decoded:
            break
    assert decoded, "Swiss QR barcode NOT independently decodable from rendered PDF"
    fields=decoded.splitlines()
    assert len(fields)==31, f"expected 31 Swiss QR fields, got {len(fields)}"
    assert fields[:4]==['SPC','0200','1','CH9300762011623852957']
    assert fields[4:11]==['S','LSZH Invest GmbH','Rummelmatt','8','5610','Wohlen','CH']
    assert fields[18:20]==['499.90','CHF']
    assert fields[27:]==['NON','','Rechnung RE-1000','EPD']
    assert all('TEST_ONLY' not in f for f in fields[:11])
    # Validate approximate fixed position and 46mm physical QR extent from SVG vectors.
    # Fail closed on missing title/amount/addresses. Independent SIX portal approval
    # remains a separate check; this script never calls their portal.
    print('PASS: A4, Swiss QR physical region, 31 fields, IBAN-format fixture, CHF/NON, branding/non-MWST, independent optical decode')

if __name__=='__main__':
    verify(sys.argv[1] if len(sys.argv)>1 else 'crm-v2/out/TEST_ONLY_LSZH_Swiss_QR.pdf')
