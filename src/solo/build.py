import pathlib
HERE = pathlib.Path(__file__).parent
s=open(HERE / 'page.html').read()
i=s.index('<section id="setup">')
head, body = s[:i], s[i:]
html=f'''<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="โต๊ะจิ๊กซอว์">
<meta name="theme-color" content="#1d4c55">
<meta name="description" content="ต่อจิ๊กซอว์จากรูปของคุณเอง เลือกจำนวนชิ้นได้ ลากชิ้นจากถาดขึ้นไปต่อบนกระดาน">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect x='6' y='14' width='40' height='40' rx='6' fill='%2338b2a6'/%3E%3Ccircle cx='26' cy='12' r='8' fill='%2338b2a6'/%3E%3Ccircle cx='48' cy='34' r='8' fill='%23e2b06e'/%3E%3C/svg%3E">
<style>[hidden]{{display:none!important}}img{{max-width:100%}}html{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}@supports (height:100dvh){{html{{height:100dvh}}}}</style>
{head.replace('<meta name="claude:viewport-fit-sides" content="cover">','').strip()}
</head>
<body>
{body}
</body>
</html>
'''
open(HERE.parent.parent / 'index.html','w').write(html)
