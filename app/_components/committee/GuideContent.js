"use client";

import { useState } from "react";
import Icon from "@/app/_components/ui/Icon";

/**
 * One person reads this, occasionally, when he has forgotten what a button
 * does. So: short sentences, the order the screens actually sit in the
 * sidebar, and no word this app does not itself use.
 *
 * Urdu is a full translation, not a summary -- a viewer who only reads Urdu
 * should be able to run the whole month from this page alone.
 */
const SECTIONS = [
  {
    icon: "dashboard",
    en: {
      title: "What this app is for",
      body: [
        "Every month, ten people each put in Rs 4,000. The pot goes to one person, in turn. That person pays it back a little every month, on top of his own ordinary contribution, until his turn comes round again.",
        "This app keeps that record. It does not change what anyone actually owes — it only shows it and remembers it, so nothing has to be carried in a notebook alone.",
      ],
    },
    ur: {
      title: "یہ ایپ کس کام کے لیے ہے",
      body: [
        "ہر مہینے دس افراد میں سے ہر ایک 4,000 روپے جمع کرواتا ہے۔ یہ رقم باری باری ایک فرد کو دی جاتی ہے۔ وہ فرد اپنی معمول کی قسط کے ساتھ ساتھ یہ رقم تھوڑی تھوڑی کر کے واپس کرتا ہے، یہاں تک کہ اس کی باری دوبارہ آ جائے۔",
        "یہ ایپ صرف یہ ریکارڈ رکھتی ہے۔ یہ کسی کے اصل واجبات کو نہیں بدلتی — صرف دکھاتی اور یاد رکھتی ہے، تاکہ سب کچھ صرف ایک کاپی کے سہارے نہ رہے۔",
      ],
    },
  },
  {
    icon: "clock",
    en: {
      title: "The flow, every month",
      body: [
        "The same handful of steps, every month, mostly on the \"This month\" screen:",
        "1. Sign in as manager.",
        "2. Open \"This month\". As each person hands over his Rs 4,000, press his contribution button.",
        "3. As anyone still repaying an earlier withdrawal hands over his installment, press \"Record repayment\" against his name and type what he gave you.",
        "4. When it is time to hand the committee over, open the withdrawal card, check who is next in the queue, and give it to him. The app refuses on its own if the account cannot afford it.",
        "5. Once everyone has paid, press \"Close this month\" to move on. If something was missed, reopen it, fix it, and close it again.",
        "6. Print the month's summary, or save it as a PDF, and pass it to the other nine — that sheet is the only thing most of them will ever see.",
        "Nothing here has to happen in one sitting. A contribution or repayment can be recorded any day of the month, as it actually arrives.",
      ],
    },
    ur: {
      title: "ہر مہینے کا طریقہ کار",
      body: [
        "ہر مہینے یہی چند مراحل دہرائے جاتے ہیں، زیادہ تر \"اس مہینے کا کام\" سکرین پر:",
        "1۔ منیجر کے طور پر سائن ان کریں۔",
        "2۔ \"اس مہینے کا کام\" کھولیں۔ جیسے ہی کوئی فرد اپنے 4,000 روپے دے، اس کے چندے کا بٹن دبائیں۔",
        "3۔ جو رکن پہلے کی نکلوائی گئی رقم واپس کر رہا ہے، جیسے ہی وہ اپنی قسط دے، اس کے نام کے سامنے \"قسط ریکارڈ کریں\" دبائیں اور جو رقم اس نے دی وہ لکھیں۔",
        "4۔ جب کمیٹی دینے کا وقت آئے تو نکلوانے والا کارڈ کھولیں، دیکھیں کہ باری کس کی ہے، اور اسے رقم دے دیں۔ اگر کھاتہ یہ برداشت نہ کر سکے تو ایپ خود ہی منع کر دے گی۔",
        "5۔ جب سب نے ادائیگی کر دی ہو تو آگے بڑھنے کے لیے \"اس مہینے کو بند کریں\" دبائیں۔ اگر کچھ رہ گیا ہو تو اسے دوبارہ کھولیں، درست کریں، اور دوبارہ بند کر دیں۔",
        "6۔ مہینے کا خلاصہ پرنٹ کریں، یا پی ڈی ایف کے طور پر محفوظ کریں، اور باقی نو ارکان کو دے دیں — زیادہ تر ارکان صرف یہی شیٹ دیکھتے ہیں۔",
        "یہ سب کچھ ایک ہی وقت میں کرنا ضروری نہیں۔ چندہ یا قسط مہینے کے کسی بھی دن ریکارڈ کی جا سکتی ہے، جیسے ہی وہ اصل میں موصول ہو۔",
      ],
    },
  },
  {
    icon: "lock",
    en: {
      title: "Signing in",
      body: [
        "Muhammad Arshad signs in as manager. He can record contributions and payments, hand over the committee, and change its rules.",
        "A viewer login can look at everything and change nothing — useful for a member who wants to check the books himself. A viewer login only works on this laptop; it does not work from anywhere else.",
      ],
    },
    ur: {
      title: "لاگ ان کرنا",
      body: [
        "محمد ارشد \"منیجر\" کے طور پر سائن ان کرتے ہیں۔ وہ چندہ اور ادائیگیاں درج کر سکتے ہیں، کمیٹی کسی کو دے سکتے ہیں، اور اصول تبدیل کر سکتے ہیں۔",
        "\"ویور\" لاگ ان سے سب کچھ دیکھا جا سکتا ہے مگر کچھ بھی تبدیل نہیں کیا جا سکتا — یہ اس رکن کے لیے مفید ہے جو خود کھاتہ دیکھنا چاہے۔ ویور لاگ ان صرف اسی لیپ ٹاپ پر کام کرتا ہے، کہیں اور نہیں۔",
      ],
    },
  },
  {
    icon: "dashboard",
    en: {
      title: "Dashboard — the first screen",
      body: [
        "Shows how much money is in the account, how many people have paid this month, how much is still owed back across every withdrawal, and how much is safe to hand over each month.",
        "If a warning appears here, it means the agreed amount is more than the account can safely carry right now. It explains why, and what would fix it — hand over less, collect repayments faster, or have everyone put in a little more.",
      ],
    },
    ur: {
      title: "ڈیش بورڈ — پہلی سکرین",
      body: [
        "یہ دکھاتی ہے کہ کمیٹی کے کھاتے میں کتنی رقم ہے، اس مہینے کتنے لوگوں نے ادائیگی کی ہے، تمام نکلوائی گئی رقوم میں سے کتنی واپس آنی ابھی باقی ہے، اور ہر مہینے کتنی رقم دینا محفوظ ہے۔",
        "اگر یہاں کوئی انتباہ نظر آئے تو اس کا مطلب ہے کہ طے شدہ رقم اس سے زیادہ ہے جو کھاتہ ابھی محفوظ طریقے سے برداشت کر سکتا ہے۔ یہ بتاتی ہے کہ ایسا کیوں ہے، اور اسے کیسے ٹھیک کیا جا سکتا ہے — کم رقم دے کر، تیزی سے قسطیں وصول کر کے، یا ہر فرد سے تھوڑی زیادہ رقم لے کر۔",
      ],
    },
  },
  {
    icon: "month",
    en: {
      title: "This month — the screen you use most",
      body: [
        "Ordered the way the month actually happens: contributions first, then repayments, then the withdrawal.",
        "Record contribution: press the button next to a name as their Rs 4,000 comes in.",
        "Record repayment: for a member still paying back an earlier withdrawal, press \"Record repayment\" and type the amount he handed you. Nothing stops him paying more than the installment — that only ends his withdrawal sooner.",
        "Give the committee: pick who is due next and hand over the amount. The app refuses if the account cannot afford it, and says why — either the money is not there, or handing it over would leave the account too thin later on.",
        "Close this month: once everyone has paid, press this to move on to the next month. If it was closed by mistake, it can be reopened.",
        "Print summary: prints the sheet the other nine members actually see — save it as a PDF or hand it out on paper.",
      ],
    },
    ur: {
      title: "اس مہینے کا کام — سب سے زیادہ استعمال ہونے والی سکرین",
      body: [
        "اسی ترتیب میں جس طرح مہینہ اصل میں چلتا ہے: پہلے چندہ، پھر قسطیں، پھر کمیٹی کی ادائیگی۔",
        "چندہ درج کریں: جیسے ہی کسی کے 4,000 روپے آئیں، اس کے نام کے سامنے بٹن دبائیں۔",
        "قسط ریکارڈ کریں: جو رکن پہلے سے لی گئی رقم واپس کر رہا ہے، اس کے لیے \"قسط ریکارڈ کریں\" دبائیں اور وہ رقم لکھیں جو اس نے آپ کو دی۔ وہ اپنی قسط سے زیادہ بھی دے سکتا ہے — اس سے صرف اس کی واپسی جلدی مکمل ہو جاتی ہے۔",
        "کمیٹی دیں: اگلی باری والے شخص کو منتخب کریں اور رقم دے دیں۔ اگر کھاتہ یہ برداشت نہیں کر سکتا تو ایپ منع کر دے گی اور وجہ بتائے گی — یا تو رقم موجود نہیں، یا یہ رقم دینے سے کھاتہ آگے چل کر بہت کم رہ جائے گا۔",
        "اس مہینے کو بند کریں: جب سب نے ادائیگی کر دی ہو تو یہ دبائیں تاکہ اگلے مہینے پر جایا جا سکے۔ غلطی سے بند ہو جانے کی صورت میں اسے دوبارہ کھولا جا سکتا ہے۔",
        "خلاصہ پرنٹ کریں: وہی شیٹ پرنٹ ہوتی ہے جو باقی نو ارکان دیکھتے ہیں — اسے پی ڈی ایف کے طور پر محفوظ کریں یا کاغذ پر دے دیں۔",
      ],
    },
  },
  {
    icon: "members",
    en: {
      title: "Members",
      body: [
        "Every person's own history: what he has put in, what he has taken out, what he still owes, and when his turn came round.",
      ],
    },
    ur: {
      title: "ارکان",
      body: [
        "ہر فرد کی مکمل تاریخ: اس نے کتنا جمع کروایا، کتنا نکالا، اس پر کتنا باقی ہے، اور اس کی باری کب آئی۔",
      ],
    },
  },
  {
    icon: "history",
    en: {
      title: "Past months",
      body: [
        "Every earlier month, exactly as it stood when it was closed. Nothing here can be changed — a correction is made by reversing the original entry, wherever it was recorded.",
      ],
    },
    ur: {
      title: "گزشتہ مہینے",
      body: [
        "ہر پچھلا مہینہ، بالکل ویسا جیسے وہ بند کیا گیا تھا۔ یہاں کچھ بھی تبدیل نہیں کیا جا سکتا — کوئی اصلاح اصل اندراج کو ریورس کر کے کی جاتی ہے، چاہے وہ کہیں بھی درج ہوا ہو۔",
      ],
    },
  },
  {
    icon: "projection",
    en: {
      title: "Projection",
      body: [
        "Shows what the account will look like over the next few years if things carry on as they are, and whether the agreed monthly amount is actually one the account can sustain, or only sustain later.",
        "\"Try other amounts\" lets you test a different payout, repayment period, or contribution before agreeing to it with the members.",
      ],
    },
    ur: {
      title: "تخمینہ (پراجیکشن)",
      body: [
        "دکھاتی ہے کہ اگر معاملات اسی طرح چلتے رہیں تو آئندہ چند سالوں میں کھاتہ کیسا نظر آئے گا، اور کیا طے شدہ ماہانہ رقم ابھی برقرار رکھی جا سکتی ہے یا صرف بعد میں۔",
        "\"دوسری رقوم آزمائیں\" سے آپ ارکان سے طے کرنے سے پہلے کوئی مختلف رقم، واپسی کی مدت، یا چندہ آزما کر دیکھ سکتے ہیں۔",
      ],
    },
  },
  {
    icon: "settings",
    en: {
      title: "Settings",
      body: [
        "Change the committee's own rules — the monthly contribution, how long a withdrawal takes to repay, the agreed payout. This only affects what happens from here on; nothing already recorded is rewritten.",
        "Add or remove logins, change a password, or reset one for someone else.",
        "Back up the books to a USB stick. Keep the copy somewhere that leaves the building — a backup sitting beside the laptop is lost along with it.",
      ],
    },
    ur: {
      title: "سیٹنگز",
      body: [
        "کمیٹی کے اپنے اصول تبدیل کریں — ماہانہ چندہ، رقم واپس کرنے کی مدت، اور طے شدہ رقم۔ یہ صرف آئندہ پر اثر انداز ہوتا ہے؛ جو کچھ پہلے سے درج ہو چکا وہ تبدیل نہیں ہوتا۔",
        "لاگ ان شامل یا ختم کریں، پاس ورڈ تبدیل کریں، یا کسی اور کا پاس ورڈ دوبارہ سیٹ کریں۔",
        "کھاتے کا بیک اپ یو ایس بی پر لیں۔ اس کی نقل کہیں ایسی جگہ رکھیں جو عمارت سے باہر جائے — لیپ ٹاپ کے ساتھ رکھا بیک اپ اسی کے ساتھ ضائع ہو جاتا ہے۔",
      ],
    },
  },
  {
    icon: "undo",
    en: {
      title: "If something is entered wrong",
      body: [
        "Nothing in this app can be edited or deleted — that is deliberate. A mistake is corrected by reversing the entry: press \"Reverse\" next to it. Both the original and the reversal stay on the record and cancel out in every total, so nothing is hidden, only corrected in the open.",
      ],
    },
    ur: {
      title: "اگر کوئی اندراج غلط ہو جائے",
      body: [
        "اس ایپ میں کچھ بھی مٹایا یا تبدیل نہیں کیا جا سکتا — یہ جان بوجھ کر ایسا رکھا گیا ہے۔ کوئی غلطی اندراج کو \"ریورس\" کر کے درست کی جاتی ہے۔ اصل اور ریورس دونوں اندراج ریکارڈ میں رہتے ہیں اور ہر کل رقم میں ایک دوسرے کو کاٹ دیتے ہیں، تاکہ کچھ بھی چھپایا نہ جائے، صرف کھلے عام درست کیا جائے۔",
      ],
    },
  },
];

export default function GuideContent() {
  const [lang, setLang] = useState("en");

  return (
    <div>
      <div className="mb-6 flex gap-2" role="tablist" aria-label="Guide language">
        <button
          type="button"
          role="tab"
          aria-selected={lang === "en"}
          onClick={() => setLang("en")}
          className={lang === "en" ? "btn-primary" : "btn"}
        >
          English
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={lang === "ur"}
          onClick={() => setLang("ur")}
          className={`text-urdu ${lang === "ur" ? "btn-primary" : "btn"}`}
        >
          اردو
        </button>
      </div>

      <div
        className="grid gap-4"
        dir={lang === "ur" ? "rtl" : "ltr"}
        lang={lang}
      >
        {SECTIONS.map((section, i) => {
          const copy = section[lang];
          return (
            <section key={i} className="card p-6">
              <h2 className={`flex items-center gap-3 text-lg ${lang === "ur" ? "text-urdu" : ""}`}>
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                  <Icon name={section.icon} className="size-5" />
                </span>
                {copy.title}
              </h2>
              <div className={`mt-3 space-y-2.5 text-base text-text-light ${lang === "ur" ? "text-urdu" : ""}`}>
                {copy.body.map((para, j) => (
                  <p key={j}>{para}</p>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
