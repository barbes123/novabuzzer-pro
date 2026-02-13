<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1Hl0kwd2oy3OMGVO3p-2fTPhGfYaavzx_

## Run Locally

**Prerequisites:**  Node.js

0. rm -rf node_modules package-lock.json && npm install
1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

**Links**

http://localhost:5173/?role=host

**Errors**

sudo lsof -i :3001
kill -9 <PID_NUMBER>
sudo ss -lptn 'sport = :3001'
sudo pkill -9 node


**some notes**

// "SOCKET_URL": "http://10.42.0.1:3000",