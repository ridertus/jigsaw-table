import pathlib
d = pathlib.Path(__file__).parent
r = lambda n: (d / n).read_text()
html = f'''<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="โต๊ะจิ๊กซอว์">
<meta name="theme-color" content="#1a3c43">
<meta name="description" content="ห้องนั่งเล่นพิกเซลสำหรับต่อจิ๊กซอว์กับเพื่อน คุยกันได้ และเปิดวิทยุฟังพร้อมกัน">
<title>โต๊ะจิ๊กซอว์ · ห้องนั่งเล่น</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect x='6' y='14' width='40' height='40' rx='6' fill='%2338b2a6'/%3E%3Ccircle cx='26' cy='12' r='8' fill='%2338b2a6'/%3E%3Ccircle cx='48' cy='34' r='8' fill='%23e2b06e'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Mitr:wght@400;500;600&family=Nunito:wght@600;700;800&display=swap">
<style>
{r('base.css')}
{r('extra.css')}
{r('lobby.css')}
</style>
</head>
<body>
{r('body.html')}
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.js"></script>
<script>
{r('prelude.js')}
{r('common.js')}
{r('head.js')}
{r('room.js')}
{r('art.js')}
{r('puzzle.js')}
{r('hud.js')}
{r('ambient.js')}
{r('lobby.js')}
}})();
</script>
</body>
</html>
'''
(pathlib.Path(__file__).parent.parent.parent / 'lobby.html').write_text(html)
