Write-Host "🔨 Building frontend..."
npm run build

Write-Host "📤 Uploading to EC2..."
scp -i "C:\Users\abhip\ps-ops-platform\ec2\Abhi1stkey.pem" -r dist/* ubuntu@3.109.171.73:~/dist/

Write-Host "🚀 Deploying on server..."
ssh -i "C:\Users\abhip\ps-ops-platform\ec2\Abhi1stkey.pem" ubuntu@3.109.171.73 "mkdir -p ~/dist && chmod +x deploy-frontend.sh && ./deploy-frontend.sh"

Write-Host "✅ Done"