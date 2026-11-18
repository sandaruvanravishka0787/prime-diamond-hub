require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('Set SESSION_SECRET to a random value of at least 32 characters in production.');
}
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const uploadDir = path.join(ROOT, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
const db = new Database(path.join(ROOT, 'data', 'prime.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL CHECK(category IN ('diamond','membership')),
 name TEXT NOT NULL, price INTEGER NOT NULL CHECK(price >= 0), active INTEGER NOT NULL DEFAULT 1,
 sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS offers (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
 product_id INTEGER NOT NULL REFERENCES products(id), product_name TEXT NOT NULL,
 base_price INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0, amount_due INTEGER NOT NULL,
 game_uid TEXT NOT NULL, payment_method TEXT NOT NULL DEFAULT 'Ez Cash',
 payment_reference TEXT NOT NULL, slip_filename TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 points_awarded INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS point_ledger (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
 order_id INTEGER REFERENCES orders(id), delta INTEGER NOT NULL, note TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const seed = [
 ['diamond','25 Diamonds',130], ['diamond','100 Diamonds',390], ['diamond','310 Diamonds',1030],
 ['diamond','520 Diamonds',1780], ['diamond','1060 Diamonds',3530], ['diamond','5600 Diamonds',17030],
 ['membership','Weekly Lite',170], ['membership','Weekly Membership',570], ['membership','Weekly Max',700],
 ['membership','Monthly Membership',2850], ['membership','VIP Membership',3550], ['membership','Super VIP Membership',5200]
];
if (db.prepare('SELECT COUNT(*) AS n FROM products').get().n === 0) {
 const ins = db.prepare('INSERT INTO products(category,name,price,sort_order) VALUES(?,?,?,?)');
 seed.forEach((p,i) => ins.run(...p,i));
}
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
 const exists = db.prepare('SELECT id FROM users WHERE email=?').get(process.env.ADMIN_EMAIL.toLowerCase());
 if (!exists) {
   const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
   db.prepare('INSERT INTO users(name,email,password_hash,points) VALUES(?,?,?,0)')
     .run('PRIME Admin', process.env.ADMIN_EMAIL.toLowerCase(), hash);
   // Admin role is stored separately so customer accounts cannot access admin APIs.
   db.prepare('CREATE TABLE IF NOT EXISTS admins (user_id INTEGER PRIMARY KEY REFERENCES users(id))');
   db.prepare('INSERT OR IGNORE INTO admins(user_id) SELECT id FROM users WHERE email=?').run(process.env.ADMIN_EMAIL.toLowerCase());
 }
}
db.exec('CREATE TABLE IF NOT EXISTS admins (user_id INTEGER PRIMARY KEY REFERENCES users(id))');
if (process.env.ADMIN_EMAIL) {
  db.prepare('INSERT OR IGNORE INTO admins(user_id) SELECT id FROM users WHERE email=?').run(process.env.ADMIN_EMAIL.toLowerCase());
}

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(session({
 secret: process.env.SESSION_SECRET || 'dev-only-change-this-secret',
 resave: false, saveUninitialized: false,
 store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(ROOT, 'data') }),
 cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000*60*60*8 }
}));
app.use('/api/auth', rateLimit({ windowMs: 15*60*1000, limit: 30, standardHeaders: true, legacyHeaders: false }));

const storage = multer.diskStorage({
 destination: (_req,_file,cb) => cb(null, uploadDir),
 filename: (_req,file,cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({ storage, limits: { fileSize: 5*1024*1024 }, fileFilter: (_req,file,cb) => {
 const ok = ['image/jpeg','image/png','image/webp','application/pdf'].includes(file.mimetype);
 cb(ok ? null : new Error('Upload JPG, PNG, WEBP or PDF only.'), ok);
}});

function currentUser(req) {
 if (!req.session.userId) return null;
 return db.prepare('SELECT id,name,email,points FROM users WHERE id=?').get(req.session.userId) || null;
}
function requireUser(req,res,next) { if (!currentUser(req)) return res.status(401).json({error:'Please sign in first.'}); next(); }
function requireAdmin(req,res,next) {
 const u = currentUser(req);
 if (!u || !db.prepare('SELECT user_id FROM admins WHERE user_id=?').get(u.id)) return res.status(403).json({error:'Admin access required.'});
 req.user = u; next();
}

app.get('/api/shop', (_req,res) => {
 const products = db.prepare('SELECT id,category,name,price FROM products WHERE active=1 ORDER BY sort_order,id').all();
 const offers = db.prepare('SELECT id,title,description FROM offers WHERE active=1 ORDER BY id DESC').all();
 res.json({ products, offers, whatsapp: process.env.SHOP_WHATSAPP || '94756649083', ezcashNotice: 'Ez Cash දාද්දී රු.30ක් වැඩිපුර දාන්න.', loyalty: 'Rs.100 = 1 Point • 10 Points = Rs.20 Discount' });
});
app.post('/api/auth/register', (req,res) => {
 const {name,email,password} = req.body || {};
 if (!name || !email || !/^\S+@\S+\.\S+$/.test(email) || !password || password.length < 8) return res.status(400).json({error:'Enter your name, valid email and a password with at least 8 characters.'});
 try {
  const hash = bcrypt.hashSync(password,12);
  const result = db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run(name.trim().slice(0,60),email.toLowerCase().trim(),hash);
  req.session.userId = result.lastInsertRowid;
  res.json({user:currentUser(req)});
 } catch(e) { res.status(409).json({error:'That email is already registered.'}); }
});
app.post('/api/auth/login', (req,res) => {
 const {email,password} = req.body || {};
 const user = db.prepare('SELECT * FROM users WHERE email=?').get(String(email||'').toLowerCase().trim());
 if (!user || !bcrypt.compareSync(String(password||''),user.password_hash)) return res.status(401).json({error:'Email or password is incorrect.'});
 req.session.userId = user.id; res.json({user:currentUser(req)});
});
app.post('/api/auth/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/me',(req,res)=>{ const user=currentUser(req); res.json({user}); });

app.post('/api/orders', requireUser, upload.single('slip'), (req,res) => {
 const {productId,gameUid,paymentReference,redeemPoints} = req.body || {};
 const product = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(Number(productId));
 if (!product) return res.status(400).json({error:'Please choose an available package.'});
 if (!gameUid || String(gameUid).trim().length < 4 || !paymentReference || String(paymentReference).trim().length < 3 || !req.file) return res.status(400).json({error:'Enter your game UID and payment reference, and upload your payment slip.'});
 const user = currentUser(req);
 const wantRedeem = redeemPoints === 'true' || redeemPoints === '1';
 const tx = db.transaction(() => {
   const fresh = db.prepare('SELECT points FROM users WHERE id=?').get(user.id);
   const redeem = wantRedeem ? Math.min(Math.floor(fresh.points/10)*10, Math.floor(product.price/20)*10) : 0;
   const discount = Math.floor(redeem/10)*20;
   const amountDue = product.price-discount;
   const info = db.prepare(`INSERT INTO orders(user_id,product_id,product_name,base_price,discount,amount_due,game_uid,payment_reference,slip_filename)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(user.id,product.id,product.name,product.price,discount,amountDue,String(gameUid).trim().slice(0,40),String(paymentReference).trim().slice(0,80),req.file.filename);
   if (redeem) {
     db.prepare('UPDATE users SET points=points-? WHERE id=?').run(redeem,user.id);
     db.prepare('INSERT INTO point_ledger(user_id,order_id,delta,note) VALUES(?,?,?,?)').run(user.id,info.lastInsertRowid,-redeem,'Points redeemed for order');
   }
   return {orderId:info.lastInsertRowid,discount,amountDue,redeemed:redeem};
 });
 try { res.json(tx()); } catch(e) { if (req.file) fs.unlink(req.file.path,()=>{}); res.status(500).json({error:'Could not create order.'}); }
});
app.get('/api/my-orders',requireUser,(req,res)=>{
 res.json({orders:db.prepare('SELECT id,product_name,base_price,discount,amount_due,status,points_awarded,created_at FROM orders WHERE user_id=? ORDER BY id DESC').all(req.user?.id || req.session.userId)});
});

app.get('/api/admin/summary',requireAdmin,(_req,res)=>{
 res.json({orders:db.prepare('SELECT COUNT(*) n FROM orders').get().n,pending:db.prepare("SELECT COUNT(*) n FROM orders WHERE status='pending'").get().n,users:db.prepare('SELECT COUNT(*) n FROM users WHERE id NOT IN (SELECT user_id FROM admins)').get().n,revenue:db.prepare("SELECT COALESCE(SUM(amount_due),0) n FROM orders WHERE status='approved'").get().n});
});
app.get('/api/admin/orders',requireAdmin,(_req,res)=>{
 const orders=db.prepare(`SELECT o.*,u.name customer_name,u.email customer_email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC`).all(); res.json({orders});
});
app.get('/api/admin/slips/:filename',requireAdmin,(req,res)=>{
 const name=path.basename(req.params.filename); const file=path.join(uploadDir,name);
 if (!fs.existsSync(file)) return res.sendStatus(404); res.sendFile(file);
});
app.post('/api/admin/orders/:id/status',requireAdmin,(req,res)=>{
 const status=req.body?.status;
 if (!['approved','rejected'].includes(status)) return res.status(400).json({error:'Invalid status.'});
 const order=db.prepare('SELECT * FROM orders WHERE id=?').get(Number(req.params.id));
 if (!order) return res.status(404).json({error:'Order not found.'});
 if (order.status !== 'pending') return res.status(409).json({error:'This order has already been reviewed.'});
 const tx=db.transaction(()=>{
   if(status==='approved') {
     const points=Math.floor(order.amount_due/100);
     db.prepare("UPDATE orders SET status='approved',points_awarded=? WHERE id=?").run(points,order.id);
     if(points>0){db.prepare('UPDATE users SET points=points+? WHERE id=?').run(points,order.user_id);db.prepare('INSERT INTO point_ledger(user_id,order_id,delta,note) VALUES(?,?,?,?)').run(order.user_id,order.id,points,'Points earned from approved order');}
   } else {
     db.prepare("UPDATE orders SET status='rejected' WHERE id=?").run(order.id);
     // Restore any points redeemed on this rejected order.
     const redeemed=db.prepare('SELECT COALESCE(-SUM(delta),0) n FROM point_ledger WHERE order_id=? AND delta<0').get(order.id).n;
     if(redeemed>0){db.prepare('UPDATE users SET points=points+? WHERE id=?').run(redeemed,order.user_id);db.prepare('INSERT INTO point_ledger(user_id,order_id,delta,note) VALUES(?,?,?,?)').run(order.user_id,order.id,redeemed,'Points restored after rejected order');}
   }
 });
 tx(); res.json({ok:true});
});
app.get('/api/admin/products',requireAdmin,(_req,res)=>res.json({products:db.prepare('SELECT * FROM products ORDER BY sort_order,id').all()}));
app.post('/api/admin/products',requireAdmin,(req,res)=>{
 const {id,category,name,price,active}=req.body||{};
 if(!['diamond','membership'].includes(category)||!name||!Number.isInteger(Number(price))||Number(price)<0) return res.status(400).json({error:'Enter valid product details.'});
 if(id) db.prepare('UPDATE products SET category=?,name=?,price=?,active=? WHERE id=?').run(category,name.trim().slice(0,80),Number(price),active?1:0,Number(id));
 else db.prepare('INSERT INTO products(category,name,price,active) VALUES(?,?,?,1)').run(category,name.trim().slice(0,80),Number(price));
 res.json({ok:true});
});
app.delete('/api/admin/products/:id',requireAdmin,(req,res)=>{db.prepare('UPDATE products SET active=0 WHERE id=?').run(Number(req.params.id));res.json({ok:true});});
app.get('/api/admin/users',requireAdmin,(_req,res)=>res.json({users:db.prepare('SELECT id,name,email,points,created_at FROM users WHERE id NOT IN (SELECT user_id FROM admins) ORDER BY id DESC').all()}));
app.post('/api/admin/users/:id/points',requireAdmin,(req,res)=>{
 const delta=Number(req.body?.delta), note=String(req.body?.note||'Admin adjustment').slice(0,100);
 if(!Number.isInteger(delta)||delta===0||Math.abs(delta)>10000) return res.status(400).json({error:'Enter a whole-number points adjustment.'});
 const user=db.prepare('SELECT points FROM users WHERE id=?').get(Number(req.params.id)); if(!user)return res.sendStatus(404);
 if(user.points+delta<0)return res.status(400).json({error:'Points cannot become negative.'});
 const tx=db.transaction(()=>{db.prepare('UPDATE users SET points=points+? WHERE id=?').run(delta,Number(req.params.id));db.prepare('INSERT INTO point_ledger(user_id,delta,note) VALUES(?,?,?)').run(Number(req.params.id),delta,note);});tx();res.json({ok:true});
});
app.get('/api/admin/offers',requireAdmin,(_req,res)=>res.json({offers:db.prepare('SELECT * FROM offers ORDER BY id DESC').all()}));
app.post('/api/admin/offers',requireAdmin,(req,res)=>{const {title,description,active}=req.body||{};if(!title||!description)return res.status(400).json({error:'Enter offer title and description.'});db.prepare('INSERT INTO offers(title,description,active) VALUES(?,?,?)').run(String(title).slice(0,80),String(description).slice(0,240),active===false?0:1);res.json({ok:true});});
app.delete('/api/admin/offers/:id',requireAdmin,(req,res)=>{db.prepare('UPDATE offers SET active=0 WHERE id=?').run(Number(req.params.id));res.json({ok:true});});

// Payment slips are intentionally NOT exposed as public static files. Admins access them via the protected route above.
app.use(express.static(path.join(ROOT,'public')));
app.get('/admin',(_req,res)=>res.sendFile(path.join(ROOT,'public','admin.html')));
app.use((err,_req,res,_next)=>{console.error(err);res.status(400).json({error:err.message||'Request failed.'});});
app.listen(PORT,()=>console.log(`PRIME DIAMOND HUB running on http://localhost:${PORT}`));
