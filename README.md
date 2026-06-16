# MegaCars — აღდგენილი პროექტი

ეს არის შენი ძველი megacars.ge საიტი, სრულად აღდგენილი და გატესტილი.
აკლდა Models/ ფოლდერი და package.json — ეს აღდგა server.js-ის მიხედვით.

## რა არის შიგნით
- index.html, calculator.html, style.css  → საჯარო საიტი
- login.html, dashboard.html/js/css        → დილერის/ადმინის პორტალი
- server.js                                → Express სერვერი (API)
- Models/User.js, Models/Car.js            → ბაზის სქემები (აღდგენილი)
- createAdmin.js, reset.js                 → ადმინის შექმნა/რესეტი
- package.json                             → ბიბლიოთეკები
- .env.example                             → გადაარქვი .env-ად და შეავსე

## გაშვება (ლოკალურად ან სერვერზე)
1. npm install
2. შექმენი უფასო ბაზა: mongodb.com/atlas → Connect → Drivers → დააკოპირე URI
3. გადაარქვი .env.example → .env, ჩასვი MONGO_URI (JWT_SECRET უკვე ჩაწერილია)
4. npm run seed:admin   (ქმნის ადმინს — შემდეგ აუცილებლად შეცვალე პაროლი!)
5. npm start            (გაეშვება :5000-ზე)

## მნიშვნელოვანი
- ძველი ბაზა ლოკალური იყო (127.0.0.1) და სერვერთან ერთად წაიშალა.
  ახალი ბაზა აიღე Atlas-ზე (ღრუბელში) — სერვერი თუ წაიშლება, ბაზა გადარჩება.
- ძველი მანქანების ფოტოები (/uploads) აღარ არსებობს — თავიდან აიტვირთება მანქანების დამატებისას.
