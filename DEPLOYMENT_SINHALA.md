# PRIME DIAMOND HUB – සිංහල Setup Guide

## 1. අවශ්‍ය දේ
- Node.js 20 හෝ ඊට ඉහළ සංස්කරණයක්
- Node.js app එකක් run කළ හැකි hosting සේවාවක්
- Persistent storage/disk එකක් (SQLite database සහ payment slips සඳහා)

## 2. පළමු වරට Run කිරීම
1. Project ZIP එක extract කරන්න.
2. `.env.example` file එක copy කර `.env` ලෙස නම් කරන්න.
3. `.env` තුළ `SESSION_SECRET` එකට දිගු random secret එකක් දාන්න.
4. `ADMIN_EMAIL` සහ `ADMIN_PASSWORD` ඔබේම admin login details වලට වෙනස් කරන්න.
5. Terminal එකෙන් project folder එකට ගිහින් `npm install` run කරන්න.
6. ඉන්පසු `npm start` run කරන්න.
7. Shop: `/`  | Admin: `/admin`

## 3. Android එකෙන්
Android phone එකෙන් code edit කළ හැකි නමුත් backend එක run කරන්න Node.js hosting එකක් අවශ්‍යයි. Netlify static site එක පමණක් Express backend + SQLite database එක run කිරීමට ප්‍රමාණවත් නැහැ. Node.js host එකකට deploy කරලා domain එක Netlify හරහා හෝ වෙනම connect කරන්න.

## 4. Order එකක් සිදුවන ආකාරය
1. Customer account එකක් හදනවා / sign in වෙනවා.
2. Package එකක් තෝරනවා.
3. Player UID, payment reference සහ payment slip එක upload කරනවා.
4. Order එක Admin Dashboard එකේ Pending ලෙස පෙන්වනවා.
5. Admin මුදල් ලැබුණු බව වෙනම පරීක්ෂා කර Approve කරනවා.
6. Approve කළ පසු Rs.100කට 1 point එකක් customer account එකට එකතු වෙනවා.
7. Points 10ක් redeem කළ විට Rs.20ක් අඩු වෙනවා.

## 5. වැදගත් ආරක්ෂක කරුණු
- `.env` file එක කිසිවිටෙක public කරන්න එපා.
- Real payments භාරගැනීමට පෙර test orders භාවිතයෙන් සියල්ල පරීක්ෂා කරන්න.
- Payment slip එකක් ලැබුණා කියලා පමණක් order එක approve කරන්න එපා; payment එක ඔබේ නිල payment account එකෙන් තහවුරු කරන්න.
- Hosting එකේ persistent disk සහ HTTPS සක්‍රිය කරන්න.
- Payment slips සහ customer details පුද්ගලික දත්ත ලෙස සුරක්ෂිතව තබාගන්න.
