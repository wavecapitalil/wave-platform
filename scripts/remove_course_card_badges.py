#!/usr/bin/env python3
"""Remove small embedded lesson-number badges from course cover art.
Only the badge region is reconstructed; all other decoded pixels and canvas
dimensions remain unchanged. PNG is written losslessly and WebP lossless.
"""
from pathlib import Path
import io
import subprocess
import cv2
import numpy as np
from PIL import Image

BASE_REF="403942b6f7baabb0bf1ac3f29f36c63cd65eee7d"
subprocess.run(["git","fetch","--quiet","--deepen=20","origin","main"],check=True)
def original_bytes(path):
    return subprocess.check_output(["git","show",f"{BASE_REF}:{path.as_posix()}"])
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
    img=cv2.imdecode(np.frombuffer(original_bytes(p),dtype=np.uint8),cv2.IMREAD_COLOR)
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
    with Image.open(io.BytesIO(original_bytes(p))) as im:
        img=np.array(im.convert("RGB"))
    h,w=img.shape[:2]
    # Original webp covers are 1000x500; scale coordinates if size differs.
    a,b,c,d=[int(round(v*k)) for v,k in zip((x0,y0,x1,y1),(w/1000,h/500,w/1000,h/500))]
    a=max(a,0);b=max(b,0);c=min(c,w);d=min(d,h)
    # Row-wise sky reconstruction avoids bright smears from the large white digits.
    # The original source is restored on each run; all other pixels stay identical.
    rgb=img.copy()
    sample=img[b:d,max(0,a-85):max(1,a-16)]
    median=np.median(sample,axis=1).astype(np.float32)
    k=min(35, (len(median)//2)*2-1)
    if k>=3:
        median=cv2.GaussianBlur(median.reshape(-1,1,3),(1,k),0).reshape(-1,3)
    if n==11:
        # The source beside this badge includes a bright green candle. Keep
        # the reconstructed corner a restrained dark terminal background.
        median=np.minimum(median,np.array([35.,47.,58.],dtype=np.float32))
    for row in range(b,d):
        rgb[row,a:c]=np.clip(median[row-b],0,255).astype(np.uint8)
    feather=14
    for row in range(b,d):
        for col in range(a,min(a+feather,c)):
            alpha=(col-a+1)/feather
            rgb[row,col]=img[row,col]*(1-alpha)+rgb[row,col]*alpha
    for row in range(max(b,d-feather),d):
        alpha=(d-row)/feather
        rgb[row,a:c]=np.uint8(np.clip(img[row,a:c]*(1-alpha)+rgb[row,a:c]*alpha,0,255))
    Image.fromarray(rgb).save(p,"WEBP",lossless=True,method=6)
    print("cleaned",p,w,h)
