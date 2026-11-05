#!/usr/bin/env python3
"""Remove small embedded lesson-number badges from course cover art.
Only the badge region is reconstructed; all other decoded pixels and canvas
dimensions remain unchanged. PNG is written losslessly and WebP lossless.
"""
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

ROOT=Path("apps/terminal/public/assets")
A=ROOT/"Candlesticks_Approved_Card_Art_Units_1-3 (2)"/"assets"
B=ROOT/"candlesticks-unit4"

# coordinates use the original source-image pixels, x1/y1 exclusive
regions={
"1-1":(417,0,437,43),"1-2":(0,0,22,44),"1-3":(0,0,56,45),"1-4":(0,0,77,47),
"2-1":(308,0,333,57),"2-2":(0,0,21,54),"2-3":(0,0,39,56),
"2-4":(0,0,58,57),"2-5":(0,0,80,55),
"3-1":(309,0,333,64),"3-2":(0,0,22,64),"3-3":(0,0,40,67),
"3-4":(0,0,72,64),"3-5":(0,0,83,68),
}
for k,(a,b,c,d) in regions.items():
    p=A/("lesson-"+k+".png")
    if not p.exists():
        raise FileNotFoundError(p)
    img=cv2.imread(str(p),cv2.IMREAD_COLOR)
    h,w=img.shape[:2]
    assert c<=w and d<=h,(str(p),w,h)
    # Pad the edge so that inpainting has enough neighboring pixels.
    pad=30
    padded=cv2.copyMakeBorder(img,pad,pad,pad,pad,cv2.BORDER_REFLECT_101)
    mask=np.zeros(padded.shape[:2],dtype=np.uint8)
    mask[b+pad:d+pad,a+pad:c+pad]=255
    result=cv2.inpaint(padded,mask,11,cv2.INPAINT_TELEA)[pad:pad+h,pad:pad+w]
    cv2.imwrite(str(p),result,[cv2.IMWRITE_PNG_COMPRESSION,9])
    print("cleaned",p,w,h)

badges={
 1:(871,0,978,49),2:(881,0,992,47),3:(882,0,988,48),
 4:(873,0,991,48),5:(875,0,985,50),6:(896,0,991,38),
 7:(887,0,996,47),8:(890,0,992,48),9:(875,0,988,53),
 10:(872,0,989,48),11:(912,25,1000,162),12:(912,25,1000,165)
}
for n,(x0,y0,x1,y1) in badges.items():
    p=B/f"lesson-4-{n:02d}.webp"
    if not p.exists(): raise FileNotFoundError(p)
    with Image.open(p) as im:
        img=np.array(im.convert("RGB"))
    h,w=img.shape[:2]
    # Original webp covers are 1000x500; scale coordinates if size differs.
    a,b,c,d=[int(round(v*k)) for v,k in zip((x0,y0,x1,y1),(w/1000,h/500,w/1000,h/500))]
    a=max(a,0);b=max(b,0);c=min(c,w);d=min(d,h)
    pad=35
    bgr=cv2.cvtColor(img,cv2.COLOR_RGB2BGR)
    padded=cv2.copyMakeBorder(bgr,pad,pad,pad,pad,cv2.BORDER_REFLECT_101)
    mask=np.zeros(padded.shape[:2],dtype=np.uint8)
    mask[b+pad:d+pad,a+pad:c+pad]=255
    clean=cv2.inpaint(padded,mask,13,cv2.INPAINT_TELEA)[pad:pad+h,pad:pad+w]
    rgb=cv2.cvtColor(clean,cv2.COLOR_BGR2RGB)
    # Lossless WebP maintains every untouched original decoded pixel exactly.
    Image.fromarray(rgb).save(p,"WEBP",lossless=True,method=6)
    print("cleaned",p,w,h)
