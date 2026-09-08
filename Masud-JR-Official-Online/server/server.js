const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const cors = require('cors');
const app = express();
const allowedOrigins = [
  'https://masud-jr-official.netlify.app',
  process.env.FRONTEND_URL
].filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('CORS blocked'));
  },
  methods: ['GET','POST','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','x-user-session','x-admin-session']
}));
const PORT = process.env.PORT || 3000;
const siteDir = path.join(__dirname, '..', 'site');
const adminDir = path.join(__dirname, '..', 'admin');
const db = new Database(path.join(__dirname, 'masud-jr.db'));
const TASK_SEED = [
  ['👍 Facebook Like',10,'https://www.facebook.com/share/p/1QHEAz4ufj/'],
  ['▶️ 15 সেকেন্ড Video Watch',50,'https://vt.tiktok.com/ZSqM48aYV/'],
  ['📢 Facebook Follow',10,'https://www.facebook.com/share/1NxgD6UEcS/'],
  ['📱 App Install Task',20,'https://example.com/app-install-task'],
  ['🔗 Website Visit',5,'https://example.com/website-visit-task']
];
const TRUCK_SEED = [
  'https://www.tiktok.com/@masud...jr/photo/7564350694442978580?is_from_webapp=1&sender_device=pc&web_id=7653554840312972818',
  'https://www.tiktok.com/@masud...jr/video/7668002389063945493?is_from_webapp=1&sender_device=pc&web_id=7653554840312972818',
  'https://www.tiktok.com/@masud...jr/video/7672464213817691412?is_from_webapp=1&sender_device=pc&web_id=7653554840312972818',
  'https://www.tiktok.com/@masud...jr/photo/7679344669792374037?is_from_webapp=1&sender_device=pc&web_id=7653554840312972818',
  'https://www.tiktok.com/@masud...jr/video/7630703738965085461?is_from_webapp=1&sender_device=pc&web_id=7653554840312972818',
  'https://www.tiktok.com/@masud...jr/video/7638558636167400725?is_from_webapp=1&sender_device=pc&web_id=7653554840312972818',
  'https://www.tiktok.com/@masud...jr/photo/7661867906900282644?is_from_webapp=1&sender_device=pc&web_id=7653554840312972818'
];
// Database
// NOTE: this is the first connected version. Existing localStorage-only accounts cannot be migrated automatically.
db.exec(`
CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY,username TEXT UNIQUE,password_hash TEXT);
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,user_id TEXT UNIQUE,name TEXT UNIQUE,password_hash TEXT,balance INTEGER DEFAULT 0,total_income INTEGER DEFAULT 0,status TEXT DEFAULT 'active',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY,title TEXT,reward INTEGER,url TEXT,active INTEGER DEFAULT 1,countdown_seconds INTEGER DEFAULT 10,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS task_completions(id INTEGER PRIMARY KEY,user_id TEXT,task_id INTEGER,reward INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,task_id));
CREATE TABLE IF NOT EXISTS task_attempts(id INTEGER PRIMARY KEY,user_id TEXT,task_id INTEGER,started_at INTEGER NOT NULL,UNIQUE(user_id,task_id));
CREATE TABLE IF NOT EXISTS trucks(id INTEGER PRIMARY KEY,title TEXT,reward INTEGER,url TEXT,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS truck_completions(id INTEGER PRIMARY KEY,user_id TEXT,truck_id INTEGER,completed_at INTEGER,UNIQUE(user_id,truck_id));
CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY,user_id TEXT,task TEXT,reward INTEGER,status TEXT DEFAULT 'Completed',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS notices(id INTEGER PRIMARY KEY,title TEXT,body TEXT,active INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS withdrawals(id INTEGER PRIMARY KEY,user_id TEXT,method TEXT,account TEXT,amount INTEGER,fee INTEGER DEFAULT 70,status TEXT DEFAULT 'pending',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS fee_payments(id INTEGER PRIMARY KEY,user_id TEXT,amount INTEGER DEFAULT 70,method TEXT,account TEXT,transaction_id TEXT,status TEXT DEFAULT 'pending',created_at TEXT DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT);
CREATE TABLE IF NOT EXISTS user_sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS admin_sessions(token TEXT PRIMARY KEY,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);
try { db.exec("ALTER TABLE tasks ADD COLUMN countdown_seconds INTEGER DEFAULT 10"); } catch(e) {}
if (!db.prepare('SELECT id FROM admins WHERE username=?').get('admin')) {
  db.prepare('INSERT INTO admins(username,password_hash) VALUES(?,?)').run('admin', bcrypt.hashSync('change-me-now', 12));
}
if (db.prepare('SELECT COUNT(*) n FROM tasks').get().n === 0) {
  const ins = db.prepare('INSERT INTO tasks(title,reward,url) VALUES(?,?,?)');
  const tx = db.transaction(() => TASK_SEED.forEach(x => ins.run(...x)));
  tx();
}
if (db.prepare('SELECT COUNT(*) n FROM trucks').get().n === 0) {
  const ins = db.prepare('INSERT INTO trucks(title,reward,url) VALUES(?,?,?)');
  const tx = db.transaction(() => TRUCK_SEED.forEach((url,i) => ins.run('🚚 Truck Video '+(i+1),50,url)));
  tx();
}
if (db.prepare('SELECT COUNT(*) n FROM notices').get().n === 0) {
  const ins = db.prepare('INSERT INTO notices(title,body) VALUES(?,?)');
  ins.run('📢 নতুন Task','নতুন Task যোগ করা হলে এখানে দেখা যাবে।');
  ins.run('⚠️ গুরুত্বপূর্ণ ঘোষণা','Task সম্পন্ন করার আগে নিয়ম ভালোভাবে পড়ুন।');
}
app.use(express.json({limit:'100kb'}));
app.use(express.urlencoded({extended:false}));

// Public website
app.use(express.static(siteDir));
// Admin panel
app.use('/admin', express.static(adminDir));

// Persistent sessions: stored in SQLite instead of RAM, so normal server restarts do not log users out.
const newToken = () => crypto.randomBytes(32).toString('hex');
function requireUser(req,res,next){
  const token = req.headers['x-user-session'];
  const session = token && db.prepare('SELECT user_id FROM user_sessions WHERE token=?').get(token);
  const userId = session && session.user_id;
  if (!userId) return res.status(401).json({error:'Login required'});
  const user = db.prepare('SELECT * FROM users WHERE user_id=?').get(userId);
  if (!user || user.status !== 'active') return res.status(403).json({error:'এই Account বর্তমানে বন্ধ আছে।'});
  req.user = user;
  next();
}
function requireAdmin(req,res,next){
  const token = req.headers['x-admin-session'];
  if (!token || !db.prepare('SELECT token FROM admin_sessions WHERE token=?').get(token)) return res.status(401).json({error:'Unauthorized'});
  next();
}
function userView(u){return {userId:u.user_id,name:u.name,balance:u.balance,totalIncome:u.total_income,status:u.status};}
// User auth
app.post('/api/register',(req,res)=>{
  const name = String(req.body.name||'').trim();
  const password = String(req.body.password||'');
  if (!name || !password) return res.status(400).json({error:'নাম ও পাসওয়ার্ড দিন।'});
  if (db.prepare('SELECT id FROM users WHERE name=?').get(name)) return res.status(409).json({error:'এই নামে অ্যাকাউন্ট আগে থেকেই আছে।'});
  const userId = 'MJR'+Math.floor(100000+Math.random()*900000);
  const hash = bcrypt.hashSync(password,12);
  try {
    db.prepare('INSERT INTO users(user_id,name,password_hash) VALUES(?,?,?)').run(userId,name,hash);
  } catch(e){ return res.status(500).json({error:'Account তৈরি করা যায়নি।'}); }
  const token = newToken();
  db.prepare('INSERT INTO user_sessions(token,user_id) VALUES(?,?)').run(token,userId);
  const user = db.prepare('SELECT * FROM users WHERE user_id=?').get(userId);
  res.json({ok:true,session:token,user:userView(user)});
});
app.post('/api/login',(req,res)=>{
  const name = String(req.body.name||'').trim();
  const password = String(req.body.password||'');
  const user = db.prepare('SELECT * FROM users WHERE name=?').get(name);
  if (!user || !bcrypt.compareSync(password,user.password_hash)) return res.status(401).json({error:'নাম অথবা পাসওয়ার্ড ভুল।'});
  if (user.status !== 'active') return res.status(403).json({error:'এই Account বর্তমানে বন্ধ আছে।'});
  const token = newToken();
  db.prepare('INSERT INTO user_sessions(token,user_id) VALUES(?,?)').run(token,user.user_id);
  res.json({ok:true,session:token,user:userView(user)});
});
app.post('/api/logout',requireUser,(req,res)=>{
  const token=req.headers['x-user-session'];
  db.prepare('DELETE FROM user_sessions WHERE token=?').run(token);
  res.json({ok:true});
});
app.get('/api/me',requireUser,(req,res)=>res.json({user:userView(req.user)}));
// User content
app.get('/api/tasks',requireUser,(req,res)=>{
  const rows = db.prepare(`SELECT t.*, EXISTS(SELECT 1 FROM task_completions c WHERE c.user_id=? AND c.task_id=t.id) completed FROM tasks t WHERE t.active=1 ORDER BY t.id`).all(req.user.user_id);
  res.json(rows);
});
app.post('/api/tasks/:id/start',requireUser,(req,res)=>{
  const task = db.prepare('SELECT * FROM tasks WHERE id=? AND active=1').get(req.params.id);
  if (!task) return res.status(404).json({error:'Task পাওয়া যায়নি।'});
  const already = db.prepare('SELECT id FROM task_completions WHERE user_id=? AND task_id=?').get(req.user.user_id,task.id);
  if (already) return res.status(409).json({error:'এই Task-এর Reward ইতিমধ্যে নেওয়া হয়েছে।'});
  const startedAt = Date.now();
  db.prepare(`INSERT INTO task_attempts(user_id,task_id,started_at) VALUES(?,?,?)
    ON CONFLICT(user_id,task_id) DO UPDATE SET started_at=excluded.started_at`).run(req.user.user_id,task.id,startedAt);
  res.json({ok:true,startedAt,countdownSeconds:Math.max(1,Number(task.countdown_seconds)||10),url:task.url});
});
app.post('/api/tasks/:id/complete',requireUser,(req,res)=>{
  const task = db.prepare('SELECT * FROM tasks WHERE id=? AND active=1').get(req.params.id);
  if (!task) return res.status(404).json({error:'Task পাওয়া যায়নি।'});
  const already = db.prepare('SELECT id FROM task_completions WHERE user_id=? AND task_id=?').get(req.user.user_id,task.id);
  if (already) return res.status(409).json({error:'এই Task-এর Reward ইতিমধ্যে নেওয়া হয়েছে।'});
  const attempt = db.prepare('SELECT started_at FROM task_attempts WHERE user_id=? AND task_id=?').get(req.user.user_id,task.id);
  const requiredMs = Math.max(1,Number(task.countdown_seconds)||10)*1000;
  if (!attempt) return res.status(400).json({error:'আগে Task Link খুলুন।'});
  const remaining = requiredMs - (Date.now()-Number(attempt.started_at));
  if (remaining > 0) return res.status(425).json({error:'আরও '+Math.ceil(remaining/1000)+' সেকেন্ড অপেক্ষা করুন।',remainingMs:remaining});
  const tx = db.transaction(()=>{
    db.prepare('INSERT INTO task_completions(user_id,task_id,reward) VALUES(?,?,?)').run(req.user.user_id,task.id,task.reward);
    db.prepare('UPDATE users SET balance=balance+?,total_income=total_income+? WHERE user_id=?').run(task.reward,task.reward,req.user.user_id);
    db.prepare('INSERT INTO history(user_id,task,reward) VALUES(?,?,?)').run(req.user.user_id,task.title,task.reward);
    db.prepare('DELETE FROM task_attempts WHERE user_id=? AND task_id=?').run(req.user.user_id,task.id);
  });
  try { tx(); } catch(e) { return res.status(409).json({error:'এই Task-এর Reward ইতিমধ্যে নেওয়া হয়েছে।'}); }
  res.json({ok:true,reward:task.reward,user:userView(db.prepare('SELECT * FROM users WHERE user_id=?').get(req.user.user_id))});
});
app.get('/api/trucks',requireUser,(req,res)=>{
  const rows = db.prepare(`SELECT t.*, COALESCE(c.completed_at,0) completed_at FROM trucks t LEFT JOIN truck_completions c ON c.user_id=? AND c.truck_id=t.id WHERE t.active=1 ORDER BY t.id`).all(req.user.user_id);
  res.json(rows);
});
app.post('/api/trucks/:id/complete',requireUser,(req,res)=>{
  const truck = db.prepare('SELECT * FROM trucks WHERE id=? AND active=1').get(req.params.id);
  if (!truck) return res.status(404).json({error:'Truck video পাওয়া যায়নি।'});
  const last = db.prepare('SELECT completed_at FROM truck_completions WHERE user_id=? AND truck_id=?').get(req.user.user_id,truck.id);
  const now = Date.now();
  if (last && now-last.completed_at < 86400000) return res.status(409).json({error:'এই ভিডিওটি আবার Reward নিতে ২৪ ঘণ্টা পূর্ণ হওয়া পর্যন্ত অপেক্ষা করুন।'});
  const tx=db.transaction(()=>{
    db.prepare(`INSERT INTO truck_completions(user_id,truck_id,completed_at) VALUES(?,?,?) ON CONFLICT(user_id,truck_id) DO UPDATE SET completed_at=excluded.completed_at`).run(req.user.user_id,truck.id,now);
    db.prepare('UPDATE users SET balance=balance+?,total_income=total_income+? WHERE user_id=?').run(truck.reward,truck.reward,req.user.user_id);
    db.prepare('INSERT INTO history(user_id,task,reward) VALUES(?,?,?)').run(req.user.user_id,truck.title,truck.reward);
  });
  tx();
  res.json({ok:true,reward:truck.reward,user:userView(db.prepare('SELECT * FROM users WHERE user_id=?').get(req.user.user_id))});
});
app.get('/api/history',requireUser,(req,res)=>{
  res.json(db.prepare('SELECT task,reward,status,created_at FROM history WHERE user_id=? ORDER BY id DESC').all(req.user.user_id));
});
app.get('/api/notices',requireUser,(req,res)=>{
  res.json(db.prepare('SELECT id,title,body,created_at FROM notices WHERE active=1 ORDER BY id DESC').all());
});
app.get('/api/fee-payment',requireUser,(req,res)=>{
  const row=db.prepare('SELECT id,amount,method,account,transaction_id,status,created_at,reviewed_at FROM fee_payments WHERE user_id=? ORDER BY id DESC LIMIT 1').get(req.user.user_id);
  res.json({feeRequired:!row||row.status!=='approved',payment:row||null,number:'01961504587'});
});
app.post('/api/fee-payment',requireUser,(req,res)=>{
  const method=String(req.body.method||'').trim();
  const account=String(req.body.account||'').trim();
  const transactionId=String(req.body.transactionId||'').trim();
  if(!['bKash','Nagad'].includes(method)||!account||!transactionId) return res.status(400).json({error:'bKash/Nagad, আপনার Account Number এবং Transaction ID দিন।'});
  const existing=db.prepare("SELECT id FROM fee_payments WHERE user_id=? AND status='pending'").get(req.user.user_id);
  if(existing) return res.status(409).json({error:'আপনার ৭০ টাকার Processing Fee এখনো Admin যাচাই করছে।'});
  db.prepare("INSERT INTO fee_payments(user_id,amount,method,account,transaction_id,status) VALUES(?,?,?,?,?,'pending')").run(req.user.user_id,70,method,account,transactionId);
  res.json({ok:true,status:'pending'});
});
app.post('/api/withdrawals',requireUser,(req,res)=>{
  const amount = Number(req.body.amount);
  const method = String(req.body.method||'');
  const account = String(req.body.account||'').trim();
  const allowed = ['bKash','Nagad','Rocket'];
  const feePayment=db.prepare("SELECT id FROM fee_payments WHERE user_id=? AND status='approved' ORDER BY id DESC LIMIT 1").get(req.user.user_id);
  if(!feePayment) return res.status(403).json({error:'প্রথম Withdraw-এর আগে ৳70 Processing Fee Admin দ্বারা অনুমোদিত হতে হবে।'});
  if (!Number.isFinite(amount) || amount < 200 || amount > req.user.balance) return res.status(400).json({error:'সঠিক পরিমাণ লিখুন। সর্বনিম্ন ৳২০০।'});
  if (!allowed.includes(method) || !account) return res.status(400).json({error:'bKash, Nagad অথবা Rocket এবং Account Number দিন।'});
  const fee = 70;
  const tx=db.transaction(()=>{
    db.prepare('UPDATE users SET balance=balance-? WHERE user_id=?').run(amount,req.user.user_id);
    db.prepare('INSERT INTO withdrawals(user_id,method,account,amount,fee) VALUES(?,?,?,?,?)').run(req.user.user_id,method,account,amount,fee);
  });
  tx();
  res.json({ok:true,fee,user:userView(db.prepare('SELECT * FROM users WHERE user_id=?').get(req.user.user_id))});
});
// Admin API
app.post('/api/admin/login',(req,res)=>{
  const a=db.prepare('SELECT * FROM admins WHERE username=?').get(String(req.body.username||''));
  if(!a || !bcrypt.compareSync(String(req.body.password||''),a.password_hash)) return res.status(401).json({error:'ভুল Admin username অথবা password'});
  const token=newToken();
  db.prepare('INSERT INTO admin_sessions(token) VALUES(?)').run(token);
  res.json({ok:true,session:token});
});
app.get('/api/admin/stats',requireAdmin,(req,res)=>res.json({
  users:db.prepare('SELECT COUNT(*) n FROM users').get().n,
  activeUsers:db.prepare("SELECT COUNT(*) n FROM users WHERE status='active'").get().n,
  pendingWithdrawals:db.prepare("SELECT COUNT(*) n FROM withdrawals WHERE status='pending'").get().n,
  pendingFeePayments:db.prepare("SELECT COUNT(*) n FROM fee_payments WHERE status='pending'").get().n,
  paidWithdrawals:db.prepare("SELECT COALESCE(SUM(amount),0) n FROM withdrawals WHERE status='paid'").get().n
}));
app.get('/api/admin/users',requireAdmin,(req,res)=>res.json(db.prepare('SELECT id,user_id,name,balance,total_income,status,created_at FROM users ORDER BY id DESC').all()));
app.patch('/api/admin/users/:id/status',requireAdmin,(req,res)=>{db.prepare('UPDATE users SET status=? WHERE id=?').run(req.body.status==='blocked'?'blocked':'active',req.params.id);res.json({ok:true})});
app.post('/api/admin/users/:id/balance',requireAdmin,(req,res)=>{const n=Number(req.body.amount);if(!Number.isFinite(n)||n===0)return res.status(400).json({error:'Valid amount দিন'});db.prepare('UPDATE users SET balance=balance+?,total_income=CASE WHEN ?>0 THEN total_income+? ELSE total_income END WHERE id=?').run(n,n,n,req.params.id);res.json({ok:true})});
app.get('/api/admin/tasks',requireAdmin,(req,res)=>res.json(db.prepare('SELECT * FROM tasks ORDER BY id DESC').all()));
app.post('/api/admin/tasks',requireAdmin,(req,res)=>{if(!req.body.title||!req.body.url)return res.status(400).json({error:'Title এবং URL দিন'});const sec=Math.max(1,Math.min(300,Number(req.body.countdownSeconds)||10));res.json({id:db.prepare('INSERT INTO tasks(title,reward,url,countdown_seconds) VALUES(?,?,?,?)').run(req.body.title,Number(req.body.reward)||0,req.body.url,sec).lastInsertRowid})});
app.patch('/api/admin/tasks/:id',requireAdmin,(req,res)=>{const task=db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);if(!task)return res.status(404).json({error:'Task পাওয়া যায়নি।'});const active=req.body.active===undefined?task.active:(req.body.active?1:0);const sec=req.body.countdownSeconds===undefined?task.countdown_seconds:Math.max(1,Math.min(300,Number(req.body.countdownSeconds)||10));db.prepare('UPDATE tasks SET active=?,countdown_seconds=? WHERE id=?').run(active,sec,req.params.id);res.json({ok:true})});
app.get('/api/admin/notices',requireAdmin,(req,res)=>res.json(db.prepare('SELECT * FROM notices ORDER BY id DESC').all()));
app.post('/api/admin/notices',requireAdmin,(req,res)=>{if(!req.body.title||!req.body.body)return res.status(400).json({error:'Title এবং notice দিন'});res.json({id:db.prepare('INSERT INTO notices(title,body) VALUES(?,?)').run(req.body.title,req.body.body).lastInsertRowid})});
app.patch('/api/admin/notices/:id',requireAdmin,(req,res)=>{db.prepare('UPDATE notices SET active=? WHERE id=?').run(req.body.active?1:0,req.params.id);res.json({ok:true})});
app.get('/api/admin/fee-payments',requireAdmin,(req,res)=>res.json(db.prepare('SELECT * FROM fee_payments ORDER BY id DESC').all()));
app.patch('/api/admin/fee-payments/:id',requireAdmin,(req,res)=>{
  const status=['pending','approved','rejected'].includes(req.body.status)?req.body.status:'pending';
  db.prepare("UPDATE fee_payments SET status=?,reviewed_at=CASE WHEN ? IN ('approved','rejected') THEN CURRENT_TIMESTAMP ELSE reviewed_at END WHERE id=?").run(status,status,req.params.id);
  res.json({ok:true});
});
app.get('/api/admin/withdrawals',requireAdmin,(req,res)=>res.json(db.prepare('SELECT * FROM withdrawals ORDER BY id DESC').all()));
app.patch('/api/admin/withdrawals/:id',requireAdmin,(req,res)=>{const ok=['pending','approved','paid','rejected'];const s=ok.includes(req.body.status)?req.body.status:'pending';db.prepare('UPDATE withdrawals SET status=? WHERE id=?').run(s,req.params.id);res.json({ok:true})});
app.post('/api/admin/logout',requireAdmin,(req,res)=>{db.prepare('DELETE FROM admin_sessions WHERE token=?').run(req.headers['x-admin-session']);res.json({ok:true})});
app.get('/admin',(req,res)=>res.redirect('/admin/'));
app.get('/',(req,res)=>res.sendFile(path.join(siteDir,'index.html')));

app.listen(PORT,()=>console.log(`Masud JR Connected Server: http://localhost:${PORT}`));
