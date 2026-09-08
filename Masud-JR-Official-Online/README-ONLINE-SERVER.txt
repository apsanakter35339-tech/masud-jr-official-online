Masud JR Official — Online Server Ready

এই প্যাকেজ Render Web Service-এর জন্য প্রস্তুত করা হয়েছে।

Render settings:
- Root Directory: server
- Language: Node
- Build Command: npm install
- Start Command: npm start
- Environment Variable: FRONTEND_URL=https://masud-jr-official.netlify.app

Deploy হওয়ার পরে Render যে URL দেবে, সেই URL দিয়ে site/script.js-এর প্রথম লাইনের
YOUR-RENDER-SERVICE.onrender.com অংশ বদলাতে হবে। তারপর updated site ফাইল Netlify-তে deploy করতে হবে।

Admin: /admin/
Default admin login: admin / change-me-now

নোট: এই প্রথম সংযোগে SQLite ব্যবহার করা হয়েছে। Render-এর ephemeral filesystem-এ persistent disk না দিলে deploy-এর সময় database reset হতে পারে। Production data-এর জন্য পরে persistent storage/Postgres করা উচিত।
