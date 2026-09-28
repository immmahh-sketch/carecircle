"""Embed TrueType fonts into a .docx (obfuscated .odttf per ECMA-376) so it renders the same without the fonts installed."""
import sys, os, re, uuid, zipfile, shutil, subprocess

FONTS = {  # family name as used in the document -> {slot: ttf path}
  "Cormorant Garamond":          {"Regular":"co3umX5slCNuHLi8bLeY9MK7whWMhyjypVO7abI26QOD_v86GnM.ttf","Bold":"co3umX5slCNuHLi8bLeY9MK7whWMhyjypVO7abI26QOD_hg9GnM.ttf","Italic":"co3smX5slCNuHLi8bLeY9MK7whWMhyjYrGFEsdtdc62E6zd58jDOjw.ttf"},
  "Cormorant Garamond SemiBold": {"Regular":"co3umX5slCNuHLi8bLeY9MK7whWMhyjypVO7abI26QOD_iE9GnM.ttf"},
  "Cormorant Garamond Medium":   {"Regular":"co3umX5slCNuHLi8bLeY9MK7whWMhyjypVO7abI26QOD_s06GnM.ttf","Italic":"co3smX5slCNuHLi8bLeY9MK7whWMhyjYrGFEsdtdc62E6zd5wDDOjw.ttf"},
  "Cinzel":                      {"Regular":"8vIU7ww63mVu7gtR-kwKxNvkNOjw-tbnTYo.ttf"},
  "Cinzel SemiBold":             {"Regular":"8vIU7ww63mVu7gtR-kwKxNvkNOjw-gjgTYo.ttf"},
  "Lato":                        {"Regular":"S6uyw4BMUTPHvxk.ttf","Bold":"S6u9w4BMUTPHh6UVew8.ttf","Italic":"S6u8w4BMUTPHjxswWw.ttf"},
  "Lato Light":                  {"Regular":"S6u9w4BMUTPHh7USew8.ttf"},
}
FONTDIR = os.path.expanduser("~/.fonts/press")
SLOT_TAG = {"Regular":"embedRegular","Bold":"embedBold","Italic":"embedItalic","BoldItalic":"embedBoldItalic"}

def obfuscate(data: bytes, guid: str) -> bytes:
    hexs = guid.strip("{}").replace("-", "")
    key = bytes.fromhex(hexs)[::-1]  # reversed GUID bytes
    out = bytearray(data)
    for i in range(32):
        out[i] ^= key[i % 16]
    return bytes(out)

def main(src, dst):
    work = dst + ".tmp"
    shutil.rmtree(work, ignore_errors=True)
    with zipfile.ZipFile(src) as z: z.extractall(work)
    os.makedirs(os.path.join(work, "word", "fonts"), exist_ok=True)
    ft_path = os.path.join(work, "word", "fontTable.xml")
    ft = open(ft_path, encoding="utf-8").read() if os.path.exists(ft_path) else '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:fonts>'
    # docx-js may write a self-closing <w:fonts .../> root
    ft = re.sub(r'<w:fonts([^>]*?)/>', r'<w:fonts\1></w:fonts>', ft, 1)
    if 'xmlns:r=' not in ft:
        ft = ft.replace('<w:fonts ', '<w:fonts xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ', 1)
    rels = []
    n = 0
    fonts_xml = ""
    for fam, slots in FONTS.items():
        # drop any existing declaration for this family
        ft = re.sub(r'<w:font w:name="%s">.*?</w:font>' % re.escape(fam), '', ft, flags=re.S)
        embeds = ""
        for slot, fname in slots.items():
            n += 1
            guid = "{" + str(uuid.uuid4()).upper() + "}"
            data = open(os.path.join(FONTDIR, fname), "rb").read()
            target = f"font{n}.odttf"
            open(os.path.join(work, "word", "fonts", target), "wb").write(obfuscate(data, guid))
            rid = f"rIdFont{n}"
            rels.append(f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/{target}"/>')
            embeds += f'<w:{SLOT_TAG[slot]} r:id="{rid}" w:fontKey="{guid}"/>'
        family = "roman" if "Cormorant" in fam or "Cinzel" in fam else "swiss"
        fonts_xml += f'<w:font w:name="{fam}"><w:charset w:val="00"/><w:family w:val="{family}"/><w:pitch w:val="variable"/>{embeds}</w:font>'
    assert "</w:fonts>" in ft, "no closing fonts tag"
    ft = ft.replace("</w:fonts>", fonts_xml + "</w:fonts>")
    open(ft_path, "w", encoding="utf-8").write(ft)
    os.makedirs(os.path.join(work, "word", "_rels"), exist_ok=True)
    open(os.path.join(work, "word", "_rels", "fontTable.xml.rels"), "w", encoding="utf-8").write(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + "".join(rels) + "</Relationships>")
    ct_path = os.path.join(work, "[Content_Types].xml")
    ct = open(ct_path, encoding="utf-8").read()
    if 'Extension="odttf"' not in ct:
        ct = ct.replace("<Default ", '<Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/><Default ', 1)
    if 'PartName="/word/fontTable.xml"' not in ct:
        ct = ct.replace("</Types>", '<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/></Types>')
    open(ct_path, "w", encoding="utf-8").write(ct)
    # document rels must point at fontTable
    drels_path = os.path.join(work, "word", "_rels", "document.xml.rels")
    drels = open(drels_path, encoding="utf-8").read()
    if "fontTable.xml" not in drels:
        drels = drels.replace("</Relationships>", '<Relationship Id="rIdFontTable" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/></Relationships>')
        open(drels_path, "w", encoding="utf-8").write(drels)
    # settings: embedTrueTypeFonts (must sit before updateFields/compat etc.; right after zoom if present)
    st_path = os.path.join(work, "word", "settings.xml")
    st = open(st_path, encoding="utf-8").read()
    if "embedTrueTypeFonts" not in st:
        flag = "<w:embedTrueTypeFonts/>"
        # schema order: ... zoom, removePersonalInformation, removeDateAndTime, doNotDisplayPageBoundaries,
        # displayBackgroundShape, printPostScriptOverText, printFractionalCharacterWidth, printFormsData, embedTrueTypeFonts ...
        placed = False
        for tag in ["printFormsData", "printFractionalCharacterWidth", "printPostScriptOverText", "displayBackgroundShape", "doNotDisplayPageBoundaries", "removeDateAndTime", "removePersonalInformation", "zoom"]:
            m = re.search(r'<w:%s\b[^>]*/>' % tag, st)
            if m:
                st = st[:m.end()] + flag + st[m.end():]; placed = True; break
        if not placed:
            st = re.sub(r'(<w:settings[^>]*>)', r'\1' + flag, st, 1)
        open(st_path, "w", encoding="utf-8").write(st)
    if os.path.exists(dst): os.remove(dst)
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as z:
        # [Content_Types].xml first
        z.write(ct_path, "[Content_Types].xml")
        for root, _, files in os.walk(work):
            for f in files:
                full = os.path.join(root, f); arc = os.path.relpath(full, work)
                if arc == "[Content_Types].xml": continue
                z.write(full, arc)
    shutil.rmtree(work)
    print("embedded", n, "font files ->", dst)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
