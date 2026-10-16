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
