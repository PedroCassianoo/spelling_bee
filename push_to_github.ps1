$ProgressPreference = 'SilentlyContinue'
$tempDir = 'C:\Users\Public\spelling_bee_git'

if (Test-Path $tempDir) { 
    Remove-Item $tempDir -Recurse -Force 
}
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

$sourceDir = $PSScriptRoot
Copy-Item -Path "$sourceDir\*" -Destination $tempDir -Recurse -Force

Set-Location $tempDir
$masterSql = "$env:USERPROFILE\.gemini\antigravity-ide\brain\c393ba4e-cf6f-4472-98be-834d96f06053\scratch\master_insert_words.sql"
if (Test-Path $masterSql) {
    Copy-Item -Path $masterSql -Destination "$tempDir\insert_words.sql" -Force
}

Write-Host "Inicializando Git no diretório temporário..."
git init
git config user.name "Pedro Cassiano"
git config user.email "pedrocassiano@example.com"
git remote add origin https://github.com/PedroCassianoo/spelling_bee.git
git branch -M main

Write-Host "Adicionando arquivos..."
git add index.html insert_words.sql insert_words_j1.sql insert_words_j2.sql insert_words_t1.sql insert_words_t2.sql vercel.json .gitignore run.bat setup_git.ps1 fetch_repo.ps1

Write-Host "Realizando commit..."
git commit -m "feat: deploy update to GitHub, Supabase and Vercel"

Write-Host "Realizando push para https://github.com/PedroCassianoo/spelling_bee.git ..."
git push -u origin main --force

Write-Host "PUSH_SUCCESSFUL"
