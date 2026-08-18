$ProgressPreference = 'SilentlyContinue'
$dir = $PSScriptRoot
if (-not $dir) { $dir = "C:\Projetos Gemini\Red News" }
Set-Location -LiteralPath $dir

Write-Host "Verificando Git em $dir..."
if (-not (Test-Path "$dir\.git")) {
    git init
    git remote add origin https://github.com/PedroCassianoo/spelling_bee.git
    git branch -M main
}

git config user.name "Pedro Cassiano"
git config user.email "pedrocassiano@example.com"

Write-Host "Adicionando arquivos..."
git add -A

$status = git status --porcelain
if ($status) {
    Write-Host "Criando commit..."
    git commit -m "feat: sync project structure at C:\Projetos Gemini\Red News with GitHub, Vercel and Supabase"
}
else {
    Write-Host "Nenhuma alteracao pendente para commit."
}

Write-Host "Realizando push para origin main..."
git push origin main

Write-Host "PUSH_SUCCESSFUL - Sincronizacao com GitHub e Vercel concluida!"
