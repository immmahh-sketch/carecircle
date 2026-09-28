import os, subprocess, sys
from PIL import Image
CH="/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
OUT=os.path.dirname(os.path.abspath(__file__))
INK="#141414"; GREEN="#16352A"; BRASS="#B08D57"; CREAM="#F3EEE4"; OX="#7A2E2B"; LAV="#9A8BC9"; COPPER="#A0623A"

# Chess-knight style horse head silhouette (viewBox 0 0 100 100)
KNIGHT='''<path d="M30 92 L70 92 L70 84 Q70 78 64 74 L58 68 Q60 60 60 52 Q60 46 66 44 L74 42 Q80 40 82 34 L80 24 Q78 18 72 16 L56 10 Q48 6 44 12 L40 14 Q34 14 30 20 L22 30 Q18 36 22 40 L28 42 Q34 44 38 40 L44 36 Q46 40 42 46 L34 54 Q28 62 30 72 Z" fill="CURRENT"/>
<circle cx="50" cy="22" r="2.6" fill="BG"/>'''

def horseshoe(color, size):
    return f'''<svg width="{size}" height="{size}" viewBox="0 0 100 100">
<path d="M50 8 C24 8 8 28 8 54 L8 80 L26 80 L26 54 C26 40 36 30 50 30 C64 30 74 40 74 54 L74 80 L92 80 L92 54 C92 28 76 8 50 8 Z" fill="{color}"/>
<g fill="{CREAM}"><rect x="14" y="60" width="6" height="12" rx="1.5"/><rect x="18" y="38" width="6" height="12" rx="1.5" transform="rotate(20 21 44)"/><rect x="36" y="18" width="6" height="12" rx="1.5" transform="rotate(50 39 24)"/><rect x="58" y="18" width="6" height="12" rx="1.5" transform="rotate(-50 61 24)"/><rect x="76" y="38" width="6" height="12" rx="1.5" transform="rotate(-20 79 44)"/><rect x="80" y="60" width="6" height="12" rx="1.5"/></g></svg>'''

def knight(color, bg, size):
    return f'<svg width="{size}" height="{size}" viewBox="0 0 100 100">{KNIGHT.replace("CURRENT",color).replace("BG",bg)}</svg>'

CSS = """
@font-face{font-family:'Cormorant Garamond';} 
*{box-sizing:border-box} body{margin:0;-webkit-font-smoothing:antialiased}
.cinzel{font-family:'Cinzel';letter-spacing:.32em;text-transform:uppercase}
.corm{font-family:'Cormorant Garamond'}
.lato{font-family:'Lato'}
"""

def blobs(cols, seed=0):
    # soft radial 'bokeh' blobs for painterly depth; positions vary with seed
    base=[(20,25,60),(78,70,70),(60,20,45),(30,80,50),(85,22,55),(15,70,65),(50,85,60),(70,40,50)]
    pick=[base[(seed+i*3)%len(base)] for i in range(4)]
    spec=[(x,y,sz,c) for (x,y,sz),c in zip(pick,cols)]
    return "".join(f'<div style="position:absolute;left:{x}%;top:{y}%;width:{s}vmin;height:{s}vmin;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,{c} 0%,transparent 70%);opacity:.85"></div>' for x,y,s,c in spec)

def plate(name, num, title, spec, g1, g2, b, dark=True, W=1600, H=1000):
    fg = CREAM if dark else INK
    sub = "rgba(243,238,228,.85)" if dark else "rgba(20,20,20,.72)"
    acc = BRASS if dark else OX
    seed = num
    html=f"""<html><head><style>{CSS}</style></head><body style="width:{W}px;height:{H}px;overflow:hidden;position:relative;background:linear-gradient(160deg,{g1} 0%,{g2} 100%)">
{blobs(b, seed)}
<div style="position:absolute;inset:0;background:repeating-linear-gradient(45deg,rgba(255,255,255,.025) 0 2px,transparent 2px 9px)"></div>
<div style="position:absolute;inset:28px;border:1.5px solid {acc};opacity:.9"></div>
<div style="position:absolute;inset:38px;border:.5px solid {acc};opacity:.5"></div>
<div style="position:absolute;left:0;right:0;top:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 120px">
  {horseshoe(acc,84)}
  <div class="cinzel" style="margin-top:26px;font-size:22px;color:{acc}">Plate {num:02d}</div>
  <div class="corm" style="margin-top:14px;font-size:80px;line-height:1.02;font-weight:500;color:{fg};font-style:italic">{title}</div>
  <div class="lato" style="margin-top:26px;font-size:27px;line-height:1.45;max-width:1000px;color:{sub};font-weight:400">{spec}</div>
</div>
<div class="cinzel" style="position:absolute;bottom:52px;left:0;right:0;text-align:center;font-size:17px;color:{acc};letter-spacing:.4em">Photograph to be placed &nbsp;·&nbsp; Red Row Estate image library</div>
</body></html>"""
    return render(name, html, W, H)

def render(name, html, W, H, scale=1, jpg=True, q=86):
    p=os.path.join(OUT,name+".html"); open(p,"w").write(html)
    png=os.path.join(OUT,name+".png")
    subprocess.run([CH,"--headless=new","--no-sandbox","--disable-gpu","--hide-scrollbars",f"--window-size={W},{H+120}",f"--force-device-scale-factor={scale}",f"--screenshot={png}","file://"+p],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
    im=Image.open(png).crop((0,0,W*scale,H*scale))
    if jpg:
        im=im.convert("RGB"); out=os.path.join(OUT,name+".jpg"); im.save(out,quality=q,optimize=True); os.remove(png); return out
    im.save(png); return png

def hills_svg(W,H):
    return f'''<svg width="{W}" height="{H}" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6C89A"/><stop offset=".55" stop-color="#F9E3C6"/><stop offset="1" stop-color="#DCE6D2"/></linearGradient>
<radialGradient id="sun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FFF3D6"/><stop offset=".4" stop-color="#FFD9A0" stop-opacity=".9"/><stop offset="1" stop-color="#FFD9A0" stop-opacity="0"/></radialGradient>
<linearGradient id="h1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9DB59A"/><stop offset="1" stop-color="#7E9C7E"/></linearGradient>
<linearGradient id="h2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6E9066"/><stop offset="1" stop-color="#4F7550"/></linearGradient>
<linearGradient id="h3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3E6B45"/><stop offset="1" stop-color="#284A33"/></linearGradient>
<linearGradient id="lav" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8E7CC3"/><stop offset="1" stop-color="#6A5AA3"/></linearGradient>
<linearGradient id="h4" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22402C"/><stop offset="1" stop-color="#16352A"/></linearGradient>
</defs>
<rect width="1600" height="1000" fill="url(#sky)"/>
<circle cx="1120" cy="330" r="260" fill="url(#sun)"/>
<path d="M0 520 Q300 420 620 500 T1200 470 T1600 520 L1600 1000 L0 1000Z" fill="url(#h1)"/>
<path d="M0 640 Q260 560 520 620 T1050 600 T1600 660 L1600 1000 L0 1000Z" fill="url(#h2)"/>
<path d="M0 760 Q400 700 800 760 T1600 740 L1600 1000 L0 1000Z" fill="url(#h3)"/>
<g opacity=".9">{"".join(f'<path d="M{x} 900 Q{x+40} {880-i*3} {x+80} 900 Z" fill="url(#lav)"/>' for i,x in enumerate(range(-40,1700,90)))}</g>
<path d="M0 900 Q500 850 900 905 T1600 890 L1600 1000 L0 1000Z" fill="url(#h4)"/>
<g fill="#1B3A2A" opacity=".9">{"".join(f'<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{r*1.25}"/>' for x,y,r in [(180,735,34),(230,745,42),(1380,715,38),(1430,730,46),(1470,745,30),(760,745,28),(800,752,36)])}</g>
</svg>'''

def cover(W=1654,H=2339):
    html=f"""<html><head><style>{CSS}</style></head><body style="width:{W}px;height:{H}px;overflow:hidden;position:relative;background:{GREEN}">
<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 30%,#22483A 0%,{GREEN} 55%,#0E241C 100%)"></div>
<div style="position:absolute;inset:0;background:repeating-linear-gradient(45deg,rgba(255,255,255,.02) 0 2px,transparent 2px 10px)"></div>
<div style="position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);width:1000px;height:1300px;border-radius:500px 500px 0 0;background:linear-gradient(180deg,#2B2F4A 0%,#5B4A7A 35%,#C98A3C 75%,#E0A050 100%);opacity:.22"></div>
<div style="position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);width:1000px;height:1300px;border-radius:500px 500px 0 0;border:1.5px solid {BRASS};opacity:.35"></div>
<div style="position:absolute;inset:64px;border:2px solid {BRASS}"></div>
<div style="position:absolute;inset:78px;border:.75px solid {BRASS};opacity:.6"></div>
<div style="position:absolute;top:150px;left:0;right:0;text-align:center">
  <div class="cinzel" style="font-size:26px;color:{BRASS};letter-spacing:.5em">Press &amp; Media Pack</div>
  <div class="cinzel" style="font-size:18px;color:rgba(243,238,228,.55);letter-spacing:.4em;margin-top:18px">2026 · First Edition</div>
</div>
<div style="position:absolute;top:47%;left:0;right:0;transform:translateY(-50%);text-align:center;padding:0 150px">
  <div style="display:flex;justify-content:center">{horseshoe(BRASS,150)}</div>
  <div class="cinzel" style="margin-top:44px;font-size:30px;color:{BRASS};letter-spacing:.42em">Home of the Black Horse Beamish</div>
  <div class="corm" style="margin-top:34px;font-size:170px;line-height:.95;color:{CREAM};font-weight:500">Red Row<br/>Estate</div>
  <div class="corm" style="margin-top:44px;font-size:46px;line-height:1.25;color:rgba(243,238,228,.85);font-style:italic;font-weight:400">Three centuries of Beamish valley life,<br/>one family, thirty-seven acres, and the open road.</div>
</div>
<div style="position:absolute;bottom:150px;left:0;right:0;text-align:center;padding:0 160px">
  <div style="width:120px;height:1px;background:{BRASS};margin:0 auto 34px"></div>
  <div class="cinzel" style="font-size:19px;line-height:2.1;color:rgba(243,238,228,.8);letter-spacing:.34em">Black Horse Beamish · Old Red Row Rooms · Red Row Retreat<br/>Huckleberry Cottage · Orchard Marquee · Aston Workshop · Car Barn</div>
  <div class="cinzel" style="margin-top:34px;font-size:20px;color:{BRASS};letter-spacing:.5em">Beamish · County Durham · DH9 0RW</div>
</div>
</body></html>"""
    return render("cover", html, W, H, q=88)

def backcover(W=1654,H=2339):
    html=f"""<html><head><style>{CSS}</style></head><body style="width:{W}px;height:{H}px;overflow:hidden;position:relative;background:{GREEN}">
<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 60%,#22483A 0%,{GREEN} 55%,#0E241C 100%)"></div>
<div style="position:absolute;inset:64px;border:2px solid {BRASS}"></div>
<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 200px">
  {horseshoe(BRASS,170)}
  <div class="cinzel" style="margin-top:50px;font-size:30px;color:{BRASS};letter-spacing:.45em">Red Row Estate</div>
  <div class="corm" style="margin-top:30px;font-size:60px;color:{CREAM};font-style:italic;font-weight:400;line-height:1.2">Come and see it for yourself.<br/>The kettle and the fire are always on.</div>
  <div style="width:120px;height:1px;background:{BRASS};margin:60px auto"></div>
  <div class="lato" style="font-size:26px;line-height:1.9;color:rgba(243,238,228,.9);font-weight:300">Red Row, Beamish, County Durham DH9 0RW<br/>01207 232569 &nbsp;·&nbsp; stay@blackhorsebeamish.co.uk<br/>blackhorsebeamish.co.uk &nbsp;·&nbsp; aston.co.uk &nbsp;·&nbsp; carbarn.co.uk</div>
  <div class="cinzel" style="margin-top:70px;font-size:17px;color:rgba(243,238,228,.5);letter-spacing:.4em">@blackhorsebeamish · Instagram · Facebook · TikTok</div>
</div>
</body></html>"""
    return render("backcover", html, W, H, q=88)

def estate_plate(W=1600,H=1000):
    html=f"""<html><head><style>{CSS}</style></head><body style="width:{W}px;height:{H}px;overflow:hidden;position:relative;background:#DCE6D2">
{hills_svg(W,H)}
<div style="position:absolute;inset:28px;border:1.5px solid {BRASS}"></div>
<div style="position:absolute;left:0;right:0;top:80px;text-align:center">
  <div class="cinzel" style="font-size:20px;color:{OX}">Plate 01</div>
  <div class="corm" style="margin-top:12px;font-size:76px;line-height:1.02;font-weight:500;color:{INK};font-style:italic">The Beamish valley from Red Row</div>
  <div class="lato" style="margin-top:18px;font-size:22px;color:rgba(20,20,20,.7);font-weight:300;max-width:900px;margin-left:auto;margin-right:auto;line-height:1.5">Hero aerial or elevated view: the estate, the lavender field, the woodland and the Black Horse in its landscape. Drone at golden hour, landscape format.</div>
</div>
<div class="cinzel" style="position:absolute;bottom:48px;left:0;right:0;text-align:center;font-size:15px;color:{CREAM};letter-spacing:.4em">Photograph to be placed · Red Row Estate image library</div>
</body></html>"""
    return render("p01_estate", html, W, H)

def emblem():
    html=f"""<html><head><style>{CSS}</style></head><body style="width:600px;height:600px;background:transparent;display:flex;align-items:center;justify-content:center">{horseshoe(GREEN,520)}</body></html>"""
    return render("emblem", html, 600, 600, jpg=False)

def knight_test():
    html=f"""<html><head><style>{CSS}</style></head><body style="width:600px;height:600px;background:{CREAM};display:flex;align-items:center;justify-content:center">{knight(GREEN,CREAM,520)}</body></html>"""
    return render("knight", html, 600, 600, jpg=False)

PLATES=[
 ("p01_estate",1,"The Beamish valley from Red Row","Hero aerial or elevated view: the estate, the lavender field, the woodland and the Black Horse in its landscape. Drone at golden hour, landscape format.","#E8B88A","#3E6B45",["#F6C89A","#7E9C7E","#F9E3C6","#4F7550"],False),
 ("p02_blackhorse",2,"The Black Horse at dusk","Exterior of the pub in its landscape, lights glowing in the windows, the row of stone cottages behind. Blue hour, landscape format.","#2B2F4A","#C98A3C",["#3B4270","#E0A050","#5B4A7A","#8A5A2E"],True),
 ("p03_bar",3,"Firelight and flagstones","Interior of the bar: open fire, flagstone floor, eclectic furniture. A second, close frame of the matchbox collection. Shot low and warm, late afternoon.","#5A2E16","#E0A050",["#8A4A20","#F0B860","#6B3A1E","#C07A30"],True),
 ("p04_food",4,"Sunday lunch at the pass","The Sunday roast being plated, or afternoon tea on the stand by the fire. Overhead and close; steam, gravy, real crockery.","#4A2A1A","#D9A05A",["#7A4A2A","#F2C27A","#3E2214","#B8803E"],True),
 ("p05_archive",5,"Red Row in the archive","The best historic photograph of the Black Horse or Red Row cottages, paired with a matching modern view from the same spot. Also: the 1740 lease from Durham University Special Collections.","#7C6448","#E4D2B8",["#8C7256","#F2E4CC","#5E4A34","#C9B08E"],False),
 ("p06_rooms",6,"An Old Red Row bedroom","One of the twelve oak-fitted rooms: handmade bed dressed, copper roll-top tub in shot. Bright, uncluttered, natural light.","#4A2E1E","#B5714A",["#6B4630","#D48A5E","#3E2618","#A0623A"],True),
 ("p07_retreat",7,"The Retreat terrace","Red Row Retreat: private terrace looking over the Beamish Burn valley, hot tub steaming, glasses on the table. Early evening.","#4F7A64","#DCE7DF",["#6B9A82","#F0F6F1","#3E6B55","#B8D2C2"],False),
 ("p08_huckleberry",8,"Huckleberry Cottage","Exterior of the cottage in the conservation valley, plus one atmospheric interior. Show the privacy and the green setting.","#3F5A3A","#C9D3B0",["#5A7A50","#E4EBD0","#2E4A2C","#9EB48A"],False),
 ("p09_wedding",9,"A Red Row wedding","The couple walking the lavender rows, and a second frame inside the Orchard Marquee dressed for a wedding breakfast of 349.","#7A2E2B","#F0D6C8",["#9E4642","#FBE6DA","#5E2220","#D9A090"],False),
 ("p10_ridley",10,"The George Ridley Suite","The suite dressed for a ceremony: stone walls, the fire lit, chairs in rows, the couple at the front. Intimate and warm.","#3B2A22","#C9A27A",["#5E4536","#E6C79C","#2A1C16","#A67C52"],True),
 ("p11_field",11,"Show day on the big field","Elevated or drone view of the field filled with 450 classic and exotic cars, the marquee and crowds. Show scale.","#6B9A3E","#F5E9B8",["#86B450","#FFF4CC","#4E7A2C","#C9D88A"],False),
 ("p12_aston",12,"Aston Workshop","Two frames: a DB5 on the lift with a craftsman at work, and the eighty-car showroom line-up. Racing green, polished chrome, workshop grit.","#0F2E22","#2E6B4F",["#1E4A36","#C8CCD0","#0A2018","#4A8A66"],True),
 ("p13_carbarn",13,"Car Barn on meet day","Drivers' Club morning: Caterhams, classics and supercars filling the yard, coffee in hand. Wide, energetic, lots of people.","#1E1E1E","#5C5C5C",["#3A3A3A","#B0282A","#141414","#8A8A8A"],True),
 ("p14_hill",14,"The Hill","The Aston Martin timeline lined up across the estate on The Hill, pre-war to present, owners and families among the cars.","#1B3A2E","#8FB39A",["#2E5A46","#C9DCCB","#14302A","#5E8A72"],True),
 ("p15_motorhome",15,"Stopover under big skies","A motorhome parked up with the valley behind and the pub within walking distance. Golden evening light, dog in shot if possible.","#5E93B8","#E9F1F5",["#7FB3D5","#FFFFFF","#3E6F92","#BFD8E8"],False),
 ("p16_lavender",16,"Lavender at Red Row","Rows of lavender in full bloom with the valley beyond; a close frame of bees on the flowers. Late June to July.","#5E4C9C","#C3B4E6",["#7A68B8","#E6DDF6","#4A3A84","#A896D6"],False),
 ("p17_coffee",17,"Red Row Estate Coffee","The roaster at work if it exists by press time; otherwise a Red Row Estate Coffee cup on the bar with the fire behind.","#2E1A10","#A5643C",["#4A2C1C","#D08A58","#1E1008","#7A4A2E"],True),
 ("p18_family",18,"The Fountain family","Bob beside a DB5 in the former sheep shed where Aston Workshop began; Bob and Fraser together at the bar. One portrait, one candid.","#6E5A48","#E8DCCB",["#8C7660","#F6EEE2","#5A4636","#C9B6A0"],False),
]

if __name__=="__main__":
    print(cover()); print(backcover()); print(emblem())
    for p in PLATES: print(plate(*p))
