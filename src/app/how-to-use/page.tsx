"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/firebase/config";
import { collection, query, where, getDocs, or, limit } from "firebase/firestore";
import { Search } from "lucide-react";
import { useI18n, type Language as Lang } from "@/lib/i18n";

type SectionTab = "getting-started" | "employees" | "managers";

interface StepItem {
  text: string;
  textAr: string;
  callout?: string;
  calloutAr?: string;
}

interface IssueRow {
  youSee: string;
  youSeeAr: string;
  whatToDo: string;
  whatToDoAr: string;
}

interface DetailedGuide {
  id: string;
  title: string;
  titleAr: string;
  summary: string;
  summaryAr: string;
  pageRoute?: string;
  steps: StepItem[];
  rulesAndLimits?: { en: string[]; ar: string[] };
  troubleshooting?: IssueRow[];
  tips?: { en: string[]; ar: string[] };
}

interface FaqItem {
  q: string;
  qAr: string;
  a: string;
  aAr: string;
}

interface GuideGroup {
  id: string;
  title: string;
  titleAr: string;
  subtitle: string;
  subtitleAr: string;
  guides: DetailedGuide[];
}

export default function HowToUsePage() {
  const { profile, loading: isProfileLoading } = useUserProfile();
  const { lang, setLang, isRTL, t } = useI18n();
  const [activeTab, setActiveTab] = useState<SectionTab>("getting-started");
  const [searchQuery, setSearchQuery] = useState("");
  const [isManagerFromDb, setIsManagerFromDb] = useState(false);

  const handleLangChange = (newLang: Lang) => {
    setLang(newLang);
  };

  // Check if current user is assigned as reporting line to any employee
  useEffect(() => {
    const checkManagerStatus = async () => {
      const email = (profile?.nisEmail || profile?.email || "").trim();
      const empId = profile?.employeeId ? String(profile.employeeId).trim() : "";
      if (!email && !empId) {
        setIsManagerFromDb(false);
        return;
      }

      try {
        const empCol = collection(db, "employee");
        const conditions: any[] = [];
        if (email) {
          conditions.push(where("reportLine1", "==", email));
          conditions.push(where("reportLine2", "==", email));
          conditions.push(where("reportLine3", "==", email));
          conditions.push(where("reportLine4", "==", email));
        }
        if (empId) {
          conditions.push(where("reportLine1", "==", empId));
          conditions.push(where("reportLine2", "==", empId));
        }

        const q = query(empCol, or(...conditions), limit(1));
        const snap = await getDocs(q);
        setIsManagerFromDb(!snap.empty);
      } catch (err) {
        console.error("Error checking manager status for guide:", err);
        setIsManagerFromDb(false);
      }
    };

    if (profile) {
      checkManagerStatus();
    }
  }, [profile]);

  // 1. GETTING STARTED GUIDES (matching Image 1, 2, 3)
  const gettingStartedGuides: DetailedGuide[] = [
    {
      id: "sign-in",
      title: "Sign in to the HR Portal",
      titleAr: "تسجيل الدخول إلى بوابة الموارد البشرية",
      summary:
        "How to log in for the first time and every day after, using your NIS Google account or your email and password.",
      summaryAr:
        "كيفية تسجيل الدخول لأول مرة وكل يوم، باستخدام حساب جوجل التابع للمدرسة أو البريد الإلكتروني وكلمة المرور.",
      steps: [
        {
          text: "Go to the portal sign in page in your browser.",
          textAr: "انتقل إلى صفحة تسجيل الدخول لبوابة الموارد البشرية في متصفحك.",
        },
        {
          text: "To sign in with Google (recommended): click 'Sign in with Google' and select your NIS school account (@nis-egypt.com). You are signed in immediately.",
          textAr: "لتسجيل الدخول بحساب جوجل (الخيار الموصى به): اضغط على 'Sign in with Google' واختر بريدك المدرسي (@nis-egypt.com). يتم تسجيل دخولك فوراً.",
        },
        {
          text: "To sign in with email and password: type your NIS email address and your password, then click Sign in.",
          textAr: "لتسجيل الدخول بالبريد وكلمة المرور: أدخل بريدك الإلكتروني وكلمة المرور المسجلة، ثم اضغط Sign in.",
        },
        {
          text: "First-time login: if HR gave you a temporary password, sign in and then click your name at the top-right → Profile to update your details.",
          textAr: "لأول مرة: إذا أعطتك إدارة الموارد البشرية كلمة مرور مؤقتة، قم بالدخول ثم اضغط على اسمك بالأعلى وافتح Profile لتحديث بياناتك.",
        },
      ],
      rulesAndLimits: {
        en: [
          "You must use your registered NIS email address. Personal email addresses cannot sign in unless linked by HR.",
          "Passwords must be at least 6 characters long.",
        ],
        ar: [
          "يجب استخدام بريدك الإلكتروني المسجل بالمدرسة (@nis-egypt.com). لا يمكن الدخول بالبريد الشخصي إلا إذا تم ربطه بواسطة الموارد البشرية.",
          "يجب ألا تقل كلمة المرور عن 6 أحرف.",
        ],
      },
      troubleshooting: [
        {
          youSee: '"Invalid email or password"',
          youSeeAr: '"Invalid email or password" (خطأ في البريد أو كلمة المرور)',
          whatToDo: "Check for spelling mistakes. If you forgot your password, see FAQ below or ask HR to reset it.",
          whatToDoAr: "تأكد من كتابة البريد وكلمة المرور بشكل صحيح. إذا نسيت كلمة المرور، راجع قسم الأسئلة الشائعة أو اطلب من HR إعادة تعيينها.",
        },
        {
          youSee: 'Google popup closes but you are not signed in',
          youSeeAr: 'نافذة جوجل تغلق دون تسجيل الدخول',
          whatToDo: "Make sure you choose your @nis-egypt.com account, not a personal Gmail account.",
          whatToDoAr: "تأكد من اختيار بريدك المدرسي @nis-egypt.com وليس بريد Gmail شخصي.",
        },
      ],
      tips: {
        en: [
          "Always prefer 'Sign in with Google' so you never have to remember or reset your password.",
        ],
        ar: [
          "يفضل دائماً استخدام 'Sign in with Google' لتجنب نسيان كلمات المرور أو الحاجة لإعادة تعيينها.",
        ],
      },
    },
    {
      id: "find-your-way",
      title: "Find your way around the portal",
      titleAr: "التعرف على أقسام وقوائم البوابة",
      summary:
        "The left menu, the top bar, your account menu, and why different people see different menu items.",
      summaryAr:
        "القائمة الجانبية، الشريط العلوي، قائمة الحساب، وسبب اختلاف القوائم بين المستخدمين.",
      steps: [
        {
          text: "The left menu (sidebar) lists the sections you are allowed to use. Click any item to open it. The page you are on is highlighted.",
          textAr: "القائمة الجانبية (Sidebar) تعرض الأقسام المسموح لك باستخدامها. اضغط على أي عنصر لفتحه. تظهر الصفحة التي تتصفحها مظللة.",
          callout:
            "Everyone sees: Dashboard, Submit Leave Request, Employee Work Leave Summary, Document Requests and How to Use.\nManagers also see Employee Management, All Leave Requests and Attendance Logs. HR also sees Employees Chart, Job Applications, System Log and Settings.",
          calloutAr:
            "يشاهد الجميع: Dashboard و Submit Leave Request و Employee Work Leave Summary و Document Requests و How to Use.\nيشاهد المديرون أيضاً: Employee Management و All Leave Requests و Attendance Logs. ويشاهد مسؤولو HR أيضاً: Employees Chart و Job Applications و System Log و Settings.",
        },
        {
          text: "On a phone, the menu is hidden. Tap the menu button at the top-left of the screen to open it.",
          textAr: "على الهاتف المحمول، تكون القائمة مخفية. اضغط زر القائمة أعلى الشاشة لفتحها.",
        },
        {
          text: "The bell at the top-right shows your notifications. A red number means you have unread notifications (see \"Use notifications\").",
          textAr: "الجرس أعلى اليمين يعرض إشعاراتك. الرقم الأحمر يعني وجود إشعارات غير مقروءة.",
        },
        {
          text: "Your name and photo at the top-right open your account menu: Profile (your personal page), Settings (HR only) and Log out.",
          textAr: "اسمك وصورتك أعلى الصفحة يفتحان قائمة الحساب: Profile (صفحتك الشخصية)، Settings (لمسؤولي HR فقط)، و Log out.",
        },
        {
          text: "To log out, click your name → Log out. You are returned to the Sign In page immediately (there is no confirmation).",
          textAr: "لتسجيل الخروج، اضغط على اسمك ← Log out. سيتم إعادتك فوراً لشاشة تسجيل الدخول دون نافذة تأكيد.",
        },
      ],
      tips: {
        en: [
          "If a menu item you expect is missing, your role or reporting line on your employee record may be wrong. For example, a manager only sees team pages if staff list them as Report Line 1 or 2. Ask HR to check.",
          "Most lists update by themselves. If something looks out of date, refresh the page (F5, or pull down on a phone).",
        ],
        ar: [
          "إذا كان هناك قسم تتوقع وجوده وغير ظاهر، قد يكون دورك أو خط التقارير المسجل لك بحاجة لمراجعة من HR (على سبيل المثال، لا تظهر للمدير طلبات الفريق إلا إذا كان مسجلاً كـ Report Line 1 أو 2).",
          "معظم الجداول تتحدث تلقائياً. إذا بدت أي بيانات قديمة، قم بتحديث الصفحة (F5 أو السحب لأسفل على الهاتف).",
        ],
      },
    },
    {
      id: "notifications",
      title: "Use notifications (the bell)",
      titleAr: "استخدام الإشعارات (رمز الجرس)",
      summary:
        "See updates about your requests, open the related page with one click, and understand when you also get an email.",
      summaryAr:
        "متابعة تحديثات طلباتك، وفتح الصفحة المرتبطة بضغطة واحدة، ومعرفة متى يتم إرسال إشعارات البريد.",
      steps: [
        {
          text: "Look at the bell at the top-right. A red badge shows how many notifications you have not read yet (9+ means more than nine).",
          textAr: "انظر إلى رمز الجرس في الشريط العلوي. توضح الشارة الحمراء عدد الإشعارات غير المقروءة (9+ تعني أكثر من 9).",
        },
        {
          text: "Click the bell. A list of your unread notifications opens, newest first, with the time (for example \"5 minutes ago\").",
          textAr: "اضغط على رمز الجرس. ستفتح قائمة بالإشعارات غير المقروءة، الأحدث أولاً، مع وقت وصولها (مثل \"5 minutes ago\").",
        },
        {
          text: "Click a notification. It is marked as read, disappears from the list, and the related page opens (for example your leave request).",
          textAr: "اضغط على أي إشعار. سيتم تعليمه كمقروء ويختفي من القائمة وتفتح الصفحة المتعلقة به مباشرة (مثل طلب الإجازة).",
        },
      ],
      rulesAndLimits: {
        en: [
          "Only unread notifications are listed. Once you click one, you cannot see it again in the bell — the information stays on the related page.",
          "There is no \"mark all as read\" button. Click each notification to clear it.",
          "You also receive an email for: leave decisions (approved/rejected), document request status changes, and professional development decisions. Managers receive an email for every new leave request from their team.",
        ],
        ar: [
          "يتم عرض الإشعارات غير المقروءة فقط. بمجرد الضغط على إشعار، يختفي من قائمة الجرس وتبقى التفاصيل في صفحة الطلب المعنية.",
          "لا يوجد زر \"تعيين الكل كمقروء\". اضغط على كل إشعار لفتحه ومسحه.",
          "تتلقى أيضاً رسائل بريد إلكتروني عند: قرارات الإجازات (اعتماد/رفض)، وتحديثات طلبات المستندات. ويستلم المديرون بريداً عند تقديم أي طلب جديد من فريقهم.",
        ],
      },
      troubleshooting: [
        {
          youSee: 'The bell says "No new notifications" but I expected one.',
          youSeeAr: 'الجرس يعرض "No new notifications" بينما كنت تتوقع إشعاراً.',
          whatToDo:
            "You may have already clicked it. Check the page directly — for example Employee Work Leave Summary for leave, or Document Requests → My Requests for documents.",
          whatToDoAr:
            "ربما تكون قد فتحته بالفعل سابقاً. افتح صفحة الطلبات مباشرة (مثل Employee Work Leave Summary للإجازات، أو My Requests للمستندات).",
        },
      ],
    },
    {
      id: "dashboard",
      title: "Understand your Dashboard",
      titleAr: "فهم لوحة التحكم الرئيسية (Dashboard)",
      summary:
        "What each part of the home screen shows and where each button takes you.",
      summaryAr:
        "ما يعرضه كل قسم في الشاشة الرئيسية وإلى أين ينقلك كل زر.",
      pageRoute: "/",
      steps: [
        {
          text: "Leave Balance Summary Cards: The top cards show your live remaining annual and casual leave balance. They update automatically whenever an approved leave is deducted.",
          textAr: "بطاقات رصيد الإجازات: تعرض في الأعلى رصيدك المتبقي من الإجازات الاعتيادية والعارضة، وتتحدث تلقائياً عند اعتماد أي إجازة.",
        },
        {
          text: "Quick Navigation Shortcuts: Click 'Submit Leave Request' or 'Document Requests' to create a new submission without opening menus.",
          textAr: "أزرار الوصول السريع: اضغط على 'Submit Leave Request' أو 'Document Requests' لتقديم طلب جديد فوراً.",
        },
        {
          text: "Recent Requests Card: Shows your latest submissions with their real-time approval status (Pending, Approved, or Rejected).",
          textAr: "بطاقة أحدث الطلبات: تعرض أحدث طلباتك مع حالتها الحالية (Pending أو Approved أو Rejected).",
        },
      ],
      rulesAndLimits: {
        en: [
          "Your leave balances reflect official working days only; weekends and public holidays do not consume your balance.",
        ],
        ar: [
          "أرصدة الإجازات تحتسب أيام العمل الفعلية فقط؛ عطلات نهاية الأسبوع والعطلات الرسمية لا تخصم من رصيدك.",
        ],
      },
    },
    {
      id: "profile-photo",
      title: "View your profile and change your photo",
      titleAr: "استعراض ملفك الشخصي وتحديث صورتك",
      summary:
        "Check that your personal and work details are correct, and change your profile photo.",
      summaryAr:
        "التأكد من صحة بياناتك الشخصية والوظيفية، وتحديث صورة الملف الشخصي.",
      pageRoute: "/profile",
      steps: [
        {
          text: "Click your name at the top-right, then Profile. The User Profile page opens.",
          textAr: "اضغط على اسمك في أعلى اليمين، ثم اختر Profile. ستفتح صفحة الملف الشخصي للمستخدم.",
        },
        {
          text: "Check the Account Details card: Full Name, Stage, Employee ID, Email Address, Phone, Role, Department, Report Line 1, Report Line 2, Date of Birth and Joined Date. A \"-\" means the field is empty.",
          textAr: "راجع بطاقة Account Details: الاسم بالكامل، المرحلة، كود الموظف، البريد، الهاتف، الوظيفة، القسم، Report Line 1، و Report Line 2. علامة \"-\" تعني أن الحقل فارغ.",
          callout:
            "Report Line 1 is your direct manager — the first person who approves your leave. Report Line 2 approves after them. If these are wrong, your requests will go to the wrong person — tell HR straight away.",
          calloutAr:
            "Report Line 1 هو مشرفك المباشر — الشخص الأول المعني باعتماد إجازتك. Report Line 2 هو المعتمد التالي. إذا كانت هذه البيانات غير صحيحة، ستذهب طلباتك للمدير الخاطئ — أبلغ HR فوراً لتعديلها.",
        },
        {
          text: "To change your photo: under your picture click Upload Photo (or Change Photo), choose a PNG, JPG or GIF image smaller than 5 MB. It is saved immediately — there is no Save button. You will see Employee photo updated successfully.",
          textAr: "لتغيير صورتك: اضغط أسفل صورتك على Upload Photo (أو Change Photo)، واختر صورة PNG أو JPG أو GIF بحجم أقل من 5 ميجابايت. يتم حفظها فوراً دون الحاجة لزر حفظ، وستظهر رسالة نجاح.",
        },
        {
          text: "To remove your photo: click Remove. It is removed immediately without asking you to confirm.",
          textAr: "لحذف صورتك: اضغط على زر Remove. يتم حذفها فوراً دون طلب تأكيد.",
        },
        {
          text: "Scroll down to My Attendance History to see each day with Check-In, Check-Out and the points for that day. Arriving by 7:30 AM or being on approved leave counts as a full day; arriving later counts as half.",
          textAr: "انزل لأسفل لبطاقة My Attendance History لمشاهدة سجل حضورك وانصرافك. الوصول بحلول 7:30 صباحاً أو التواجد في إجازة معتمدة يحتسب يوماً كاملاً؛ والتأخير يحتسب نصف يوم.",
        },
      ],
      rulesAndLimits: {
        en: [
          "You cannot edit your name, Employee ID, email, phone, role, department, report lines or dates yourself. Only HR can change them.",
          "Photo: PNG, JPG or GIF, maximum 5 MB.",
        ],
        ar: [
          "لا يمكنك تعديل اسمك أو كود الموظف أو البريد أو الهاتف أو الوظيفة أو خطوط التقارير بنفسك. مسؤولو HR هم فقط من يملكون صلاحية تعديلها.",
          "الصورة الشخصية: بصيغة PNG أو JPG أو GIF، بحد أقصى 5 ميجابايت.",
        ],
      },
      troubleshooting: [
        {
          youSee: '"File too large — Please select an image smaller than 5MB."',
          youSeeAr: '"File too large — Please select an image smaller than 5MB."',
          whatToDo: "Use a smaller picture, or take a screenshot of the photo and upload the screenshot.",
          whatToDoAr: "استخدم صورة أصغر حجماً، أو التقط لقطة شاشة (Screenshot) للصورة وقم برفعها.",
        },
        {
          youSee: '"No employee profile is linked to this user account. Please contact the HR department."',
          youSeeAr: '"No employee profile is linked to this user account. Please contact the HR department."',
          whatToDo: "Your login email does not match your employee record. Contact HR.",
          whatToDoAr: "البريد الإلكتروني الذي سجلت به الدخول غير مطابق لملف الموظف في النظام. تواصل مع HR.",
        },
        {
          youSee: "My new photo does not show at the top of the page.",
          youSeeAr: "الصورة الجديدة لا تظهر في الشريط العلوي فوراً.",
          whatToDo: "Refresh the page. The top bar picks up the new photo after a refresh.",
          whatToDoAr: "قم بتحديث الصفحة (Refresh). يقوم الشريط العلوي بتحميل الصورة الجديدة بعد التحديث.",
        },
      ],
    },
  ];

  // 2. EMPLOYEES TAB GUIDES (matching latest Screenshot exactly)
  const employeeLeaveGuides: DetailedGuide[] = [
    {
      id: "leave-types-allowances",
      title: "Leave types, allowances and how they are counted",
      titleAr: "أنواع الإجازات، الأرصدة المتاحة وكيفية احتسابها",
      summary:
        "Read this before your first request: how much of each leave type you have, when it renews, and what counts against it.",
      summaryAr:
        "اقرأ هذا الدليل قبل تقديم أول طلب: كم يبلغ رصيدك من كل نوع، متى يتجدد، وما الذي يخصم منه.",
      steps: [
        {
          text: "Annual Leave (إجازة اعتيادية): Allocated for your scheduled time off per school year based on your contract. Deducted for working days only.",
          textAr: "الإجازة الاعتيادية: مخصصة لأيام راحتك المخططة سنوياً وفقاً للعقد وسنوات الخدمة. تخصم لأيام العمل الفعلية فقط.",
        },
        {
          text: "Casual Leave (إجازة عارضة): 7 days maximum per academic year for emergency and sudden circumstances, taken up to 2 consecutive days at a time.",
          textAr: "الإجازة العارضة: بحد أقصى 7 أيام في العام الدراسي للظروف الطارئة المفاجئة، وتؤخذ يوماً أو يومين كحد أقصى للمرة الواحدة.",
        },
        {
          text: "Sick Leave (إجازة مرضية): Used for illness or medical recovery. Requires a physician's report or certified hospital note attached.",
          textAr: "الإجازة المرضية: مخصصة للمرض أو المتابعة الطبية، وتتطلب إرفاق تقرير طبي معتمد.",
        },
        {
          text: "Late Arrival & Early Dismissal (أذونات): 4 hours total per month (8 hours for SLT/Editors). Each excuse request automatically counts as 2 hours.",
          textAr: "أذونات التأخير والانصراف المبكر: 4 ساعات كحد أقصى شهرياً (8 ساعات لـ SLT/Editors). كل إذن يحتسب ساعتين.",
        },
        {
          text: "Maternity Leave & Maternity Hour: 120 consecutive calendar days for female staff; Maternity Hour provides 1 hour off per workday for nursing mothers.",
          textAr: "إجازة الوضع وساعة الرعاية: 120 يوماً متصلة للأمهات، وساعة الرعاية تحتسب ساعة واحدة عن كل يوم عمل.",
        },
      ],
      rulesAndLimits: {
        en: [
          "Annual and casual balances renew each academic year. Unused casual days expire at the end of the school year.",
          "Official school weekends (Friday & Saturday) and public holidays are never deducted from your balance.",
          "Excuses reset on the 1st of each calendar month and cannot be carried over.",
        ],
        ar: [
          "يتجدد رصيد الإجازات مع بداية العام الدراسي. تنتهي الأيام العارضة غير المستخدمة بنهاية العام.",
          "عطلات نهاية الأسبوع الرسمية (الجمعة والسبت) والعطلات الرسمية لا تخصم إطلاقاً من رصيدك.",
          "تتجدد الأذونات في اليوم الأول من كل شهر ميلادي ولا ترحل للشهر التالي.",
        ],
      },
      troubleshooting: [
        {
          youSee: '"You do not have enough leave balance."',
          youSeeAr: '"You do not have enough leave balance." (رصيدك لا يكفي)',
          whatToDo: "Check your remaining balance on Work & Leave Summary. If you believe your balance is wrong, contact HR.",
          whatToDoAr: "راجع رصيدك المتبقي في صفحة ملخص الإجازات. إذا كنت تعتقد أن الرصيد غير دقيق، تواصل مع HR.",
        },
      ],
      tips: {
        en: [
          "Weekends between leave days are free — only your scheduled working days count against your balance.",
        ],
        ar: [
          "عطلات نهاية الأسبوع الواقعة بين أيام الإجازة لا تخصم — فقط أيام العمل الفعلية هي التي تحتسب.",
        ],
      },
    },
    {
      id: "submit-leave-step-by-step",
      title: "Submit a leave request (step by step)",
      titleAr: "تقديم طلب إجازة (خطوة بخطوة)",
      summary:
        "Request any type of leave or excuse: choose the type, pick the dates, write the reason, attach a document if needed, and send it to your manager.",
      summaryAr:
        "طلب أي نوع من الإجازات أو الأذونات: اختر النوع، حدد التواريخ، اكتب السبب، أرفق المستند إن وجد، وأرسله للمدير.",
      pageRoute: "/leave/request",
      steps: [
        {
          text: "Open 'Submit Leave Request' from the sidebar menu (or go to /leave/request).",
          textAr: "افتح 'Submit Leave Request' من القائمة الجانبية (أو اذهب إلى /leave/request).",
        },
        {
          text: "Select Reporting Line Approvers (up to 2): Open the dropdown and check 1 or 2 of your assigned managers. Only these selected managers will have authority to Approve or Reject your request.",
          textAr: "اختيار مسؤولي الاعتماد (حتى 2): افتح القائمة المنسدلة وحدد مديراً أو مديرين اثنين من خطوط التقارير المعينة لك. المديرون المختارون هم فقط من يملكون صلاحية اعتماد أو رفض طلبك.",
          callout:
            "You can select up to 2 approvers. All assigned reporting lines (ReportLine 1 to 6) still receive notifications for visibility.",
          calloutAr:
            "يمكنك اختيار حتى 2 معتمدين. باقي خطوط التقارير المعينة لك (1 إلى 6) ستتلقى إشعاراً للعلم فقط.",
        },
        {
          text: "Choose Leave Type: Pick Annual, Casual, Sick, Maternity (120 days), Maternity Hour (1 hour/day), Late Arrival, or Early Dismissal.",
          textAr: "اختر نوع الإجازة: اعتيادية، عارضة، مرضية، إجازة وضع، ساعة رعاية، إذن تأخير، أو إذن انصراف مبكر.",
        },
        {
          text: "Pick Start & End Dates: Select dates using the interactive calendar. The system computes working days automatically, excluding weekends and official holidays.",
          textAr: "حدد تواريخ البداية والنهاية من التقويم. يقوم النظام بحساب أيام العمل الفعلية تلقائياً واستبعاد العطلات.",
        },
        {
          text: "Enter Reason & Upload Attachment (Optional): Type your reason (10 to 500 characters). For medical or documented excuses, upload a supporting file (PDF, PNG, JPG up to 10MB).",
          textAr: "اكتب السبب وارفع المرفق (اختياري): اكتب سبب الإجازة (10 إلى 500 حرف). للإجازات المرضية ارفع تقريراً طبياً (حتى 10 ميجابايت).",
        },
        {
          text: "Click 'Submit Request'. You will see a success confirmation and your request will be marked as Pending awaiting approval.",
          textAr: "اضغط 'Submit Request'. ستظهر رسالة تأكيد النجاح وتتحول حالة الطلب إلى Pending في انتظار المراجعة.",
        },
      ],
      rulesAndLimits: {
        en: [
          "You must select at least 1 and at most 2 reporting line approvers.",
          "Reason must be between 10 and 500 characters.",
          "Maximum file upload size is 10 MB.",
        ],
        ar: [
          "يجب اختيار مدير واحد على الأقل وبحد أقصى مديرين اثنين للاعتماد.",
          "يجب أن يكون سبب الإجازة بين 10 و 500 حرف.",
          "الحد الأقصى لحجم المرفقات هو 10 ميجابايت.",
        ],
      },
      troubleshooting: [
        {
          youSee: '"No Reporting Line Assigned"',
          youSeeAr: '"No Reporting Line Assigned" (لا يوجد خط تقارير مسجل)',
          whatToDo: "Contact HR immediately to assign your Report Line 1 on your employee profile before submitting leaves.",
          whatToDoAr: "تواصل فوراً مع قسم HR لتعيين Report Line 1 على الأقل في ملفك لتتمكن من تقديم الإجازات.",
        },
        {
          youSee: '"End date cannot be before start date"',
          youSeeAr: '"End date cannot be before start date" (تاريخ النهاية يسبق البداية)',
          whatToDo: "Make sure the end date is on or after the start date in the calendar.",
          whatToDoAr: "تأكد من أن تاريخ نهاية الإجازة يوافق تاريخ البداية أو يليه في التقويم.",
        },
      ],
      tips: {
        en: [
          "Submit planned annual leaves well in advance so your manager can arrange classroom and timetable coverage.",
        ],
        ar: [
          "قدم طلبات الإجازات الاعتيادية مسبقاً بفترة كافية حتى يتمكن مشرفك من ترتيب الحصص والبدائل.",
        ],
      },
    },
    {
      id: "check-work-leave-summary",
      title: "Check your Work & Leave Summary",
      titleAr: "مراجعة ملخص الإجازات والعمل الخاص بك",
      summary:
        "See your remaining balances, your working hours, your daily attendance and all your leave requests for any month.",
      summaryAr:
        "معرفة رصيدك المتبقي، ساعات العمل، سجل حضورك اليومي، وجميع طلبات إجازاتك لأي شهر.",
      pageRoute: "/leave/my-requests",
      steps: [
        {
          text: "Open 'Employee Work Leave Summary' in the sidebar menu (or go to /leave/my-requests).",
          textAr: "افتح 'Employee Work Leave Summary' من القائمة الجانبية (أو اذهب إلى /leave/my-requests).",
        },
        {
          text: "Check Balance Cards: View your total allocated, used, and live remaining Annual and Casual leave balances.",
          textAr: "بطاقات الأرصدة: استعرض رصيدك السنوي المستحق، الأيام المستخدمة، والرصيد المتبقي الفعلي للإجازات الاعتيادية والعارضة.",
        },
        {
          text: "Use the Month Selector: Change the month dropdown to view your attendance history and leaves for any past or upcoming month.",
          textAr: "اختيار الشهر: بدّل بين الشهور لاستعراض سجل الحضور والطلبات الخاصة بأي شهر سابق أو قادم.",
        },
        {
          text: "Review the Requests Table: See every request you submitted, its leave type, dates, working days, and status (Pending, Approved, Rejected).",
          textAr: "جدول الطلبات: استعرض كل طلب قدمته ونوعه وتواريخه وعدد الأيام المحسوبة وحالته (Pending أو Approved أو Rejected).",
        },
        {
          text: "Read Manager Notes: Click on any row to view notes, comments, or conditions left by your manager.",
          textAr: "ملاحظات المدير: اضغط على أي سطر لقراءة الملاحظات أو التوجيهات التي كتبها مديرك.",
        },
      ],
      rulesAndLimits: {
        en: [
          "Balances update dynamically as leaves are approved or cancelled.",
        ],
        ar: [
          "تتحدث الأرصدة ديناميكياً فور اعتماد الإجازات أو إلغائها.",
        ],
      },
    },
    {
      id: "track-leave-approval",
      title: "Track your leave approval",
      titleAr: "متابعة مسار اعتماد إجازتك",
      summary:
        "Who approves your request, in what order, how you are told about the decision, and what to do if you need to change or cancel it.",
      summaryAr:
        "من يعتمد طلبك، ترتيب الاعتماد، كيف يتم إعلامك بالقرار، وماذا تفعل إذا أردت تعديل أو إلغاء الطلب.",
      steps: [
        {
          text: "Who Approves: The 1 or 2 Reporting Lines you selected when submitting the request have the authority to Approve or Reject it.",
          textAr: "من يملك الاعتماد: المدير أو المديران اللذان اخترتهما عند تقديم الطلب هما من يملكان صلاحية الاعتماد أو الرفض.",
        },
        {
          text: "Notifications: You will receive an automated email notification and a top-bar bell alert the moment a manager records their decision.",
          textAr: "الإشعار بالقرار: ستتلقى بريداً إلكترونياً آلياً وإشعاراً في رمز الجرس فور تسجيل المدير قراره.",
        },
        {
          text: "Status Meaning: Pending (yellow) means awaiting manager review. Approved (green) means granted and deducted from balance. Rejected (red) means declined without deduction.",
          textAr: "معاني الحالات: Pending (أصفر) تعني قيد انتظار المراجعة. Approved (أخضر) تعني معتمدة ومخصومة من الرصيد. Rejected (أحمر) تعني مرفوضة دون خصم.",
        },
        {
          text: "Cancelling Requests: If your request is still Pending, you can cancel it directly. If already Approved, ask HR or your manager to cancel or adjust it.",
          textAr: "إلغاء الطلب: إذا كان الطلب ما زال معلقاً (Pending)، يمكنك إلغاؤه مباشرة. وإذا تم اعتماده بالفعل، اطلب من HR أو مديرك تعديله أو إلغاءه.",
        },
      ],
      rulesAndLimits: {
        en: [
          "Only your designated reporting line approvers can record a decision. Other managers see the request in view-only mode.",
          "Once Approved or Rejected, you cannot change the dates yourself.",
        ],
        ar: [
          "المديرون المعتمدون المختارون هم فقط من يسجلون القرار؛ ويرى بقية المشرفين الطلب للعلم فقط.",
          "بمجرد اعتماد الطلب أو رفضه، لا يمكنك تعديل التواريخ بنفسك.",
        ],
      },
      troubleshooting: [
        {
          youSee: 'My request is still Pending after several days.',
          youSeeAr: 'الطلب ما زال معلقاً (Pending) بعد مرور عدة أيام.',
          whatToDo: "Remind your direct manager or check if they received the email notification.",
          whatToDoAr: "قم بتذكير مديرك المباشر أو تأكد من وصول إشعار البريد الإلكتروني له.",
        },
      ],
    },
  ];

  const employeeDocumentGuides: DetailedGuide[] = [
    {
      id: "request-hr-doc",
      title: "Request an official HR document",
      titleAr: "طلب مستند رسمي أو شهادة من الموارد البشرية",
      summary:
        "Ask HR for a salary certificate, HR letter, experience letter, bank or embassy letter, social insurance statement, pay slip or contract copy.",
      summaryAr:
        "طلب شهادة راتب، خطاب موجه للبنك أو السفارة، شهادة خبرة، برنت تأمينات، مفردات مرتب، أو صورة عقد.",
      pageRoute: "/document-requests",
      steps: [
        {
          text: "Open 'Document Requests' in the left menu (or go to /document-requests).",
          textAr: "افتح 'Document Requests' من القائمة الجانبية (أو اذهب إلى /document-requests).",
        },
        {
          text: "Click the 'New Request' tab.",
          textAr: "اضغط على تبويب 'New Request'.",
        },
        {
          text: "Select Document Type: Choose Salary Certificate, HR Letter (for Bank/Visa/Embassy), Experience Certificate, Pay Slip, or To Whom It May Concern.",
          textAr: "اختر نوع المستند: شهادة راتب، خطاب موجه للبنك أو السفارة، شهادة خبرة، مفردات مرتب، أو إلى من يهمه الأمر.",
        },
        {
          text: "Specify Recipient: In 'Addressed To', type the exact name of the entity (e.g. 'French Embassy' or 'CIB Bank').",
          textAr: "تحديد الجهة: في خانة 'Addressed To'، اكتب اسم الجهة بدقة (مثل 'سفارة فرنسا' أو 'بنك CIB').",
        },
        {
          text: "Choose Delivery Method: 'Soft Copy' (downloadable PDF letter inside the portal) or 'Hard Copy' (physical stamped paper document to collect at school).",
          textAr: "طريقة الاستلام: 'Soft Copy' (نسخة إلكترونية PDF قابلة للتنزيل من البوابة) أو 'Hard Copy' (نسخة ورقية معتمدة ومختومة للاستلام من المدرسة).",
        },
        {
          text: "Select Collection Campus (for Hard Copy): Choose which school campus reception or HR office you will pick it up from.",
          textAr: "فرع الاستلام (للنسخ الورقية): حدد فرع المدرسة الذي ستستلم منه المستند.",
        },
        {
          text: "Click 'Submit Document Request'.",
          textAr: "اضغط 'Submit Document Request' لإرسال الطلب.",
        },
      ],
      rulesAndLimits: {
        en: [
          "Processing typically takes 1 to 2 working days.",
          "Make sure the 'Addressed To' matches the official name required by your bank or embassy.",
        ],
        ar: [
          "تستغرق المراجعة والإصدار عادةً من يوم إلى يومي عمل.",
          "تأكد من كتابة اسم الجهة بدقة كما تطلبه السفارة أو البنك.",
        ],
      },
    },
    {
      id: "track-download-doc",
      title: "Track and download your document",
      titleAr: "متابعة وتحميل المستند الصادر",
      summary:
        "Follow each document request through its stages, read HR notes, and view, print or save your issued document as PDF.",
      summaryAr:
        "متابعة مراحل طلب المستند، قراءة ملاحظات HR، ومعاينة أو طباعة أو حفظ المستند الصادر بصيغة PDF.",
      pageRoute: "/document-requests",
      steps: [
        {
          text: "Open 'Document Requests' and switch to the 'My Requests' tab.",
          textAr: "افتح صفحة 'Document Requests' وانتقل إلى تبويب 'My Requests'.",
        },
        {
          text: "Follow the status stages: Submitted → Under HR Review → Approved / Ready for Collection → Issued.",
          textAr: "تابع مراحل الطلب: تم الإرسال (Submitted) ← قيد المراجعة (Under HR Review) ← معتمد / جاهز للاستلام ← تم الإصدار (Issued).",
        },
        {
          text: "For Hard Copy: Once marked 'Ready for Collection', check the collection room specified by HR (e.g. Main Reception HR Office).",
          textAr: "للنسخ الورقية: بمجرد تحول الحالة إلى 'Ready for Collection'، راجع غرفة ومكتب الاستلام المحدد من HR.",
        },
        {
          text: "For Soft Copy: Once issued, click 'View Document' to preview the official NIS branded letter and download or print it as PDF.",
          textAr: "للنسخ الإلكترونية: بمجرد صدورها، اضغط 'View Document' لمعاينة الخطاب الرسمي بترويسة المدرسة وتنزيله PDF فوراً.",
        },
      ],
      rulesAndLimits: {
        en: [
          "Soft copy documents remain available in your portal account indefinitely.",
          "Hard copies should be collected within 14 days of being marked ready.",
        ],
        ar: [
          "تظل المستندات الإلكترونية الصادرة متاحة في حسابك للتحميل في أي وقت.",
          "يرجى استلام النسخ الورقية خلال 14 يوماً من إشعار الجاهزية.",
        ],
      },
    },
  ];

  // 3. MANAGERS TAB GUIDES
  const managerLeaveGuides: DetailedGuide[] = [
    {
      id: "review-employee-leave",
      title: "Review, approve, or reject employee leave requests",
      titleAr: "مراجعة واعتماد أو رفض طلبات إجازات الموظفين",
      summary:
        "Locate pending requests, inspect details, check balances and attachments, add manager notes, and record your decision.",
      summaryAr:
        "العثور على الطلبات المعلقة، مراجعة البيانات والمرفقات، إضافة ملاحظات المشرف، وتأكيد الاعتماد أو الرفض.",
      pageRoute: "/leave/all-requests",
      steps: [
        {
          text: "Open 'All Leave Requests' (/leave/all-requests) from the left sidebar menu.",
          textAr: "افتح 'All Leave Requests' (/leave/all-requests) من القائمة الجانبية.",
        },
        {
          text: "Filter for your pending approvals: Use the 'My Pending' status filter. Requests requiring your immediate decision are highlighted in soft yellow.",
          textAr: "تصفية الطلبات المعلقة الخاصة بك: استخدم فلتر 'My Pending'. تظهر الطلبات التي تنتظر قرارك مظللة باللون الأصفر الفاتح.",
        },
        {
          text: "Open request details: Click on any row to open the complete request details page (/leave/all-requests/[id]).",
          textAr: "فتح تفاصيل الطلب: اضغط على سطر أي طلب لفتح صفحة التفاصيل الكاملة (/leave/all-requests/[id]).",
        },
        {
          text: "Inspect details & attachments: Review employee name, department, leave category, requested dates, computed working days, employee's written reason, and preview any attached medical notes or files.",
          textAr: "مراجعة التفاصيل والمرفقات: راجع اسم الموظف، القسم، نوع الإجازة، التواريخ، أيام العمل الفعلية، السبب المكتوب، ومعاينة أي تقارير طبية مرفقة.",
        },
        {
          text: "Verify your approver status: Check the 'Reporting Line Approver(s)' section. If you are one of the designated approvers (or have HR administrative rights), the Approve and Reject action buttons are active.",
          textAr: "التحقق من حالة المعتمد: راجع قسم 'Reporting Line Approver(s)'. إذا كنت أحد المعتمدين المحددين (أو تملك صلاحية HR)، ستكون أزرار الاعتماد والرفض مفعلة.",
          callout:
            "An employee can select up to 2 approvers. Either selected manager can Approve or Reject. If another manager was designated, the card will display 'View only — another Reporting Line was selected'.",
          calloutAr:
            "يمكن للموظف اختيار حتى معتمدين اثنين. أي منهما يملك صلاحية الاعتماد أو الرفض. إذا تم اختيار مدير آخر، ستعرض البطاقة 'View only — another Reporting Line was selected'.",
        },
        {
          text: "Click 'Approve' (green) or 'Reject' (red): A confirmation dialog opens allowing you to input optional Manager Notes or required reasons for rejection.",
          textAr: "اضغط على 'Approve' (أخضر) أو 'Reject' (أحمر): ستفتح نافذة تأكيد تتيح لك كتابة ملاحظات المشرف (Manager Notes) أو سبب الرفض.",
        },
        {
          text: "Confirm decision: Click confirm. The status updates in real time to Approved or Rejected, balances adjust automatically, and the employee receives an immediate email notification.",
          textAr: "تأكيد القرار: اضغط تأكيد. يتم تحديث الحالة فورياً إلى معتمد أو مرفوض، وتخصم الأيام من الرصيد، ويتلقى الموظف إشعار بريد فوري.",
        },
      ],
      rulesAndLimits: {
        en: [
          "Only designated Reporting Line Approvers (max 2 per request) or authorized HR administrators can Approve or Reject.",
          "Decisions are immediate and final; once recorded, a manager cannot reverse an approval from the portal.",
          "Rejection reasons and manager notes are visible to the employee on their request summary.",
        ],
        ar: [
          "المديرون المعتمدون المختارون فقط (بحد أقصى 2 لكل طلب) أو مسؤولو HR هم من يملكون صلاحية الاعتماد أو الرفض.",
          "القرارات فورية ونهائية؛ بمجرد تسجيل القرار لا يمكن للمدير التراجع عنه بنفسه من البوابة.",
          "أسباب الرفض وملاحظات المشرف تظهر للموظف في صفحة ملخص إجازاته.",
        ],
      },
      troubleshooting: [
        {
          youSee: 'Action buttons are disabled / "View only — another Reporting Line was selected"',
          youSeeAr: 'أزرار الاعتماد والرفض معطلة ويظهر "View only — another Reporting Line was selected"',
          whatToDo:
            "The employee chose another manager from their reporting lines to approve this request. You have visibility for awareness only. If you need to approve, ask HR.",
          whatToDoAr:
            "اختار الموظف مديراً آخر من خطوط تقاريره لاعتماد هذا الطلب. يظهر لك الطلب للعلم فقط. إذا كان يتطلب موافقتك، تواصل مع HR.",
        },
        {
          youSee: 'The request does not appear in "My Pending"',
          youSeeAr: 'الطلب لا يظهر في فلتر "My Pending"',
          whatToDo:
            "Check the status filter (it may already be Approved or Rejected), or ensure the employee assigned you as an active approver.",
          whatToDoAr:
            "تأكد من فلتر الحالة (ربما تم اعتماده أو رفضه بالفعل)، أو تأكد من قيام الموظف باختيارك كمعتمد.",
        },
      ],
      tips: {
        en: [
          "Always check the 'Working Days' count — official weekends and holidays are automatically excluded by the system.",
          "Provide a constructive explanation when rejecting requests to help staff reschedule their time off without conflict.",
        ],
        ar: [
          "تحقق دائماً من عدد 'Working Days' — عطلات نهاية الأسبوع والعطلات الرسمية مستبعدة تلقائياً بواسطة النظام.",
          "اكتب سبباً توضيحياً عند رفض الطلب لمساعدة الموظف على إعادة جدولة إجازته بما لا يتعارض مع العمل.",
        ],
      },
    },
    {
      id: "approver-selection-delegation",
      title: "Reporting Line Approvers & delegation rules",
      titleAr: "قواعد اختيار مسؤولي الاعتماد والتفويض",
      summary:
        "Understand the up to 2 approvers rule, notification routing across ReportLine 1-6, and approval handling during absences.",
      summaryAr:
        "فهم قاعدة اختيار حتى معتمدين اثنين، توجيه الإشعارات لخطوط التقارير 1 إلى 6، وإجراءات الاعتماد أثناء غيابك.",
      pageRoute: "/leave/all-requests",
      steps: [
        {
          text: "Up to 2 Designated Approvers: When submitting a leave, employees choose 1 or 2 reporting lines from their profile. Only the selected managers possess decision authority.",
          textAr: "اختيار حتى معتمدين اثنين: عند تقديم الإجازة، يختار الموظف مديراً أو مديرين اثنين من ملفه الشخصي. المختارون فقط هم من يملكون صلاحية اتخاذ القرار.",
        },
        {
          text: "School-wide Awareness (ReportLine 1–6): All assigned reporting lines on the employee profile receive email notifications when a request is submitted, ensuring full coordination across stages.",
          textAr: "إشعارات العلم لجميع خطوط التقارير (1 إلى 6): يتلقى جميع المديرين المعينين في ملف الموظف إشعارات بريد فورية عند تقديم الطلب لضمان التنسيق الكامل.",
        },
        {
          text: "Absence Delegation: If you plan to be absent or on leave, instruct your team members to select your co-manager (e.g. Stage Coordinator or Assistant Principal) as their second approver.",
          textAr: "التفويض عند الغياب: إذا كنت تخطط للغياب أو في إجازة، وجه موظفي فريقك لاختيار زميلك المشرف الآخر (مثل منسق المرحلة أو النائب) كمعتمد ثانٍ.",
        },
        {
          text: "HR Executive Override: If an emergency leave requires immediate sign-off and all designated approvers are unavailable, HR Directors can execute an administrative override.",
          textAr: "الاعتماد الاستثنائي من الموارد البشرية: إذا كان هناك طلب إجازة طارئ ويتعذر وصول المعتمدين، يملك مسؤولو إدارة HR صلاحية الاعتماد الاستثنائي لإنهاء الطلب.",
        },
      ],
      rulesAndLimits: {
        en: [
          "The first designated approver to act resolves the request.",
          "Non-selected reporting lines maintain complete read-only visibility into the request status and employee balance.",
        ],
        ar: [
          "أول معتمد يسجل قراره ينهي الطلب ويعتمده أو يرفضه.",
          "بقية خطوط التقارير غير المختارة تحتفظ بصلاحية الاطلاع الكاملة على حالة الطلب ورصيد الموظف للعلم والتنسيق.",
        ],
      },
      troubleshooting: [
        {
          youSee: 'I received an email about a leave request but cannot approve it in the portal.',
          youSeeAr: 'تلقيت إشعار بريد بطلب إجازة لكن لا أستطيع اعتماده في البوابة.',
          whatToDo:
            "This is expected behavior. You received the email for schedule visibility as one of their assigned report lines, but the employee selected another manager as the active approver.",
          whatToDoAr:
            "هذا تصرف طبيعي للنظام. تلقيت البريد للعلم وتنسيق الجداول كأحد خطوط التقارير المعينة له، ولكن الموظف اختار مديراً آخر للاعتماد في هذا الطلب.",
        },
      ],
      tips: {
        en: [
          "Discuss planned department leaves during weekly coordination meetings to avoid simultaneous manager absences.",
        ],
        ar: [
          "ناقش الإجازات المخططة للقسم في الاجتماع الأسبوعي لتفادي غياب أكثر من مشرف في نفس الفترة.",
        ],
      },
    },
    {
      id: "track-team-leave-history",
      title: "Track team leave history & timetable coverage",
      titleAr: "متابعة سجل إجازات الفريق وتغطية الجداول الدراسية",
      summary:
        "Inspect historical and upcoming absences, filter by date ranges, and ensure classroom and duty coverage.",
      summaryAr:
        "الاطلاع على الإجازات السابقة والقادمة لأعضاء فريقك، الفلترة بالتواريخ، وضمان تغطية الحصص والإشراف.",
      pageRoute: "/leave/all-requests",
      steps: [
        {
          text: "Open 'All Leave Requests' (/leave/all-requests) from the sidebar.",
          textAr: "افتح 'All Leave Requests' (/leave/all-requests) من القائمة الجانبية.",
        },
        {
          text: "Filter by status 'Approved': View all confirmed absences across your team.",
          textAr: "فلترة الإجازات بحالة 'Approved': استعرض جميع الغيابات المؤكدة لفريقك.",
        },
        {
          text: "Select Date Range: Use the 'From Date' and 'To Date' calendar filters to view upcoming leaves for the next week or month.",
          textAr: "تحديد النطاق الزمني: استخدم فلاتر التاريخ (من / إلى) لمعرفة الغيابات المجدولة للأسبوع أو الشهر القادم.",
        },
        {
          text: "Filter by Leave Category: Distinguish between planned Annual leaves, emergency Casual leaves, Sick leaves, and 2-hour Late Arrival/Early Dismissal excuses.",
          textAr: "التصنيف حسب نوع الإجازة: ميّز بين الإجازات الاعتيادية المخططة، العارضة الطارئة، المرضية، وأذونات الساعتين.",
        },
        {
          text: "Plan Classroom & Duty Substitution: Align your team timetable and substitute teachers before the leave commences.",
          textAr: "ترتيب الحصص والبدائل: نسق جدول الحصص وتكليفات الإشراف مع المعلمين البدلاء قبل بدء الإجازة.",
        },
      ],
      rulesAndLimits: {
        en: [
          "Approved requests can only be canceled by HR if an employee returns to school earlier than planned.",
        ],
        ar: [
          "الطلبات المعتمدة تلغى فقط عن طريق HR في حال عودة الموظف للعمل قبل انتهاء إجازته.",
        ],
      },
      tips: {
        en: [
          "Filter by 'Approved' every Thursday afternoon to prepare Sunday timetable coverage and ensure smooth school operations.",
        ],
        ar: [
          "راجع الإجازات المعتمدة عصر كل خميس لإعداد خطة البدائل ليوم الأحد وضمان انضباط اليوم الدراسي.",
        ],
      },
    },
  ];

  const managerTeamGuides: DetailedGuide[] = [
    {
      id: "team-directory-management",
      title: "View team members & employee directory",
      titleAr: "استعراض أعضاء الفريق ودليل الموظفين",
      summary:
        "Access your team directory, view contact details, phone numbers, emergency contacts, and work profiles.",
      summaryAr:
        "الوصول لدليل موظفي فريقك، معرفة أرقام الهواتف والتواصل في الطوارئ، وتفاصيل الملف الوظيفي.",
      pageRoute: "/employees",
      steps: [
        {
          text: "Open 'Employee Management' (/employees) from the sidebar.",
          textAr: "افتح 'Employee Management' (/employees) من القائمة الجانبية.",
        },
        {
          text: "Automatic Subordinate Scoping: As a manager, the list automatically displays staff who have you listed as ReportLine 1 through 6.",
          textAr: "عرض موظفي الفريق تلقائياً: بصفتك مديراً، يعرض الجدول تلقائياً الموظفين المسجل في ملفاتهم أنك خط تقاريرهم (1 إلى 6).",
        },
        {
          text: "Search & Filter: Filter by Campus, Department, Stage, or type the employee's name or 4-digit ID in the search input.",
          textAr: "البحث والفلترة: قم بالفلترة حسب الفرع أو القسم أو المرحلة، أو اكتب اسم الموظف أو كوده الرباعي في خانة البحث.",
        },
        {
          text: "View Profile Details: Click on an employee row to view their NIS school email, personal phone, emergency contacts, joined date, and reporting lines hierarchy.",
          textAr: "الاطلاع على تفاصيل الملف: اضغط على سطر الموظف لمعرفة بريده المدرسي، هاتفه الشخصي، بيانات الطوارئ، وتاريخ التعيين.",
        },
        {
          text: "Edit Direct Reports (ReportLine 1): If you are configured as ReportLine 1 (direct manager), you can edit specific operational fields.",
          textAr: "تعديل بيانات الموظف المباشر (ReportLine 1): إذا كنت مسجلاً كـ ReportLine 1، تتاح لك صلاحية تعديل بعض البيانات التشغيلية للموظف.",
        },
      ],
      rulesAndLimits: {
        en: [
          "Managers only see staff members assigned to their reporting line hierarchy.",
          "Only HR administrators and School Directors have access to full school-wide staff directories and salary contract details.",
        ],
        ar: [
          "يشاهد المديرون فقط الموظفين التابعين لخطوط تقاريرهم.",
          "إدارة الموارد البشرية ومديرو المدرسة هم فقط من يملكون الاطلاع على السجل الشامل للمدرسة وبيانات العقود.",
        ],
      },
      troubleshooting: [
        {
          youSee: 'A new employee in my department is not showing in my list.',
          youSeeAr: 'موظف جديد في قسمي لا يظهر في قائمة الموظفين.',
          whatToDo:
            "Contact HR to verify that your email is saved in their ReportLine 1 or ReportLine 2 fields on their employee record.",
          whatToDoAr:
            "تواصل مع HR للتأكد من تسجيل بريدك الإلكتروني في حقول ReportLine 1 أو ReportLine 2 بملف الموظف.",
        },
      ],
      tips: {
        en: [
          "Bookmark the emergency contact details for staff in your department for quick access during school trips or emergencies.",
        ],
        ar: [
          "احتفظ ببيانات التواصل في الطوارئ لموظفي قسمك للرجوع إليها سريعاً أثناء الرحلات أو الحالات الطارئة.",
        ],
      },
    },
    {
      id: "monitor-attendance-logs",
      title: "Monitor daily attendance logs & punctuality",
      titleAr: "متابعة سجلات الحضور اليومي والانضباط",
      summary:
        "Track daily check-in and check-out times, evaluate punctuality points, identify tardiness, and check biometric machine logs.",
      summaryAr:
        "متابعة أوقات تسجيل الحضور والانصراف، حساب نقاط الانضباط والتأخير، وسجلات بصمة الحضور.",
      pageRoute: "/attendance-logs",
      steps: [
        {
          text: "Open 'Attendance Logs' (/attendance-logs) from the sidebar.",
          textAr: "افتح 'Attendance Logs' (/attendance-logs) من القائمة الجانبية.",
        },
        {
          text: "Set Date Filter: Use the 'From Date' and 'To Date' calendar pickers to isolate attendance for today or any past date range.",
          textAr: "تحديد التاريخ: استخدم تقويم 'From Date' و 'To Date' لعرض سجلات الحضور لليوم أو لأي فترة سابقة.",
        },
        {
          text: "Inspect Punch Times: View Check-In and Check-Out times captured directly from campus biometric fingerprint machines.",
          textAr: "مراجعة أوقات البصمة: استعرض وقت الحضور (Check-In) والانصراف (Check-Out) المسجل من أجهزة البصمة المدرسية.",
        },
        {
          text: "Understand Punctuality Rules: Arriving on or before 7:30 AM (or being on approved leave) earns a full day (1.0 point). Arriving after 7:30 AM without an approved excuse counts as 0.5 points.",
          textAr: "فهم قواعد الانضباط: الحضور بحلول 7:30 صباحاً (أو التواجد في إجازة معتمدة) يحتسب يوماً كاملاً (1.0 نقطة). والوصول بعد ذلك بدون إذن معتمد يحتسب نصف يوم (0.5 نقطة).",
        },
        {
          text: "Search by Employee: Type a teacher or staff member's name or employee ID to review their individual punctuality history across the month.",
          textAr: "البحث باسم الموظف: اكتب اسم المعلم أو كوده الوظيفي لمتابعة سجل انضباطه ومواعيد حضوره على مدار الشهر.",
        },
      ],
      rulesAndLimits: {
        en: [
          "Managers see attendance logs only for their reporting line subordinates.",
          "Fingerprint logs are synchronized from campus machines and cannot be manually edited by managers. Missing punch adjustments require HR approval.",
        ],
        ar: [
          "يشاهد المديرون سجلات الحضور للموظفين التابعين لهم فقط.",
          "سجلات البصمة متزامنة آلياً من أجهزة المدرسة ولا يمكن للمدير تعديلها يدوياً؛ وتعديل البصمات المنسية يتطلب مراجعة HR.",
        ],
      },
      troubleshooting: [
        {
          youSee: 'An employee was present but their Check-In column shows "—"',
          youSeeAr: 'الموظف كان متواجداً بالمدرسة لكن خانة Check-In فارغة "—"',
          whatToDo:
            "Verify if they used a different campus gate machine or experienced a biometric read error. Instruct them to report the missing punch to HR.",
          whatToDoAr:
            "تأكد مما إذا كان قد سجل في جهاز بوابة أخرى أو واجه خطأ في قراءة البصمة. اطلب منه إبلاغ HR لتسجيل الحضور.",
        },
      ],
      tips: {
        en: [
          "Regularly review Monday morning attendance logs to address repeated tardiness with staff early in the school term.",
        ],
        ar: [
          "تابع سجلات الحضور صباحاً بانتظام لمعالجة حالات التأخير المتكرر مع المعلمين مبكراً.",
        ],
      },
    },
    {
      id: "export-team-reports",
      title: "Export team attendance & reports to Excel",
      titleAr: "تصدير سجلات حضور وتقارير الفريق إلى إكسيل",
      summary:
        "Download filtered attendance and leave logs as spreadsheet files for departmental analysis and archiving.",
      summaryAr:
        "تنزيل سجلات الحضور والإجازات المفلترة في ملف Excel لتحليل أداء القسم والأرشفة.",
      pageRoute: "/attendance-logs",
      steps: [
        {
          text: "Open 'Attendance Logs' (/attendance-logs) or 'All Leave Requests' (/leave/all-requests).",
          textAr: "افتح 'Attendance Logs' (/attendance-logs) أو 'All Leave Requests' (/leave/all-requests).",
        },
        {
          text: "Apply Target Filters: Filter by the desired Date Range, Machine, Status, Campus, or Stage.",
          textAr: "تطبيق الفلاتر المطلوبة: حدد النطاق الزمني أو الجهاز أو الحالة أو المرحلة التي ترغب في تحليلها.",
        },
        {
          text: "Click Export Button: Click the 'Export' (FileDown / Excel icon) button located above the table.",
          textAr: "الضغط على زر التصدير: اضغط على زر 'Export' (أيقونة إكسيل) الموجودة أعلى الجدول.",
        },
        {
          text: "Save Spreadsheet: A standardized .xlsx spreadsheet file is generated and downloaded immediately.",
          textAr: "حفظ ملف الإكسيل: يتم إنشاء وتنزيل ملف .xlsx فوراً على جهازك.",
        },
        {
          text: "Open & Analyze: Open in Microsoft Excel or Google Sheets to calculate department attendance percentages or prepare reports for School Leadership.",
          textAr: "الفتح والتحليل: افتح الملف في برنامج Excel لحساب نسب الحضور وإعداد تقارير إدارة المدرسة.",
        },
      ],
      rulesAndLimits: {
        en: [
          "Exports contain all records matching your active filters.",
          "Security filters ensure that exported data contains only employees within your reporting authority.",
        ],
        ar: [
          "يحتوي الملف المصدر على جميع السجلات المطابقة للفلاتر النشطة.",
          "تضمن ضوابط الأمان احتواء الملف المصدر على بيانات موظفي فريقك فقط دون غيرهم.",
        ],
      },
      tips: {
        en: [
          "Export monthly attendance before the 25th of each month to cross-check hours with HR payroll records.",
        ],
        ar: [
          "قم بتصدير تقرير الحضور الشهري قبل يوم 25 من كل شهر لمطابقته مع حسابات الموارد البشرية.",
        ],
      },
    },
  ];

  // FAQs by tab
  const gettingStartedFaqs: FaqItem[] = [
    {
      q: "I forgot my password. What do I do?",
      qAr: "نسيت كلمة المرور الخاصة بي. ماذا أفعل؟",
      a: "Try Sign in with Google with your NIS account first. If you use a password login, ask HR to reset it — there is no self-service reset.",
      aAr: "جرب الدخول أولاً عبر 'Sign in with Google' ببريدك المدرسي. إذا كنت تستخدم كلمة مرور، اطلب من إدارة HR إعادة تعيينها حيث لا يتوفر خيار إعادة التعيين الذاتي.",
    },
    {
      q: "Some of my details are wrong (name, title, manager, campus).",
      qAr: "بعض بياناتي غير صحيحة (الاسم، المسمى الوظيفي، المشرف المباشر، الفرع).",
      a: "Only HR can change your record. Send HR the correct information. Wrong report lines send your requests to the wrong manager, so report it quickly.",
      aAr: "إدارة الموارد البشرية (HR) هي فقط من تملك صلاحية تعديل بياناتك المسجلة. أرسل لهم البيانات الصحيحة؛ فالخطأ في خطوط التقارير يرسل طلباتك للمدير الخاطئ، لذا سارع بإبلاغهم.",
    },
    {
      q: "Can I use the portal on my phone?",
      qAr: "هل يمكنني استخدام البوابة من هاتفي المحمول؟",
      a: "Yes. Open the same link in your phone browser. Tap the menu button at the top-left to open the menu.",
      aAr: "نعم. افتح نفس الرابط في متصفح هاتفك. واضغط على زر القائمة في أعلى الشاشة لعرض جميع الأقسام.",
    },
  ];

  const employeeFaqs: FaqItem[] = [
    {
      q: "Can I cancel or edit a leave request?",
      qAr: "هل يمكنني تعديل أو إلغاء طلب الإجازة بعد تقديمه؟",
      a: "If your request is still Pending, you can cancel it directly from the Employee Work Leave Summary page. If it has already been Approved, you cannot edit it yourself — you must notify HR or your manager so they can adjust or cancel it in the system.",
      aAr: "إذا كان طلبك ما زال معلقاً (Pending)، يمكنك إلغاؤه مباشرة من صفحة ملخص الإجازات. أما إذا تم اعتماده بالفعل (Approved)، فلا يمكنك تعديله بنفسك، بل يجب إخطار المشرف أو إدارة HR لتعديله أو إلغائه.",
    },
    {
      q: "Why did my balance go down before my manager approved?",
      qAr: "لماذا انخفض رصيدي قبل موافقة مديري على الطلب؟",
      a: "When you submit a leave request, the system temporarily reserves the requested days so you cannot accidentally submit overlapping requests. If your manager Rejects or cancels the request, the days are immediately restored to your available balance.",
      aAr: "عند تقديم طلب الإجازة، يقوم النظام بحجز الأيام مؤقتاً لتجنب تقديم طلبات متعارضة في نفس الفترة. إذا تم رفض الطلب أو إلغاؤه، تعود الأيام لرصيدك المتاح فوراً.",
    },
    {
      q: "Do weekends and public holidays count in my leave?",
      qAr: "هل تحتسب أيام عطلة نهاية الأسبوع والإجازات الرسمية ضمن إجازتي؟",
      a: "No. The system automatically excludes official school weekend days (Friday & Saturday) and configured national holidays. Only scheduled working days count against your leave balance.",
      aAr: "لا. يقوم النظام باستبعاد عطلات نهاية الأسبوع الرسمية (الجمعة والسبت) والعطلات الرسمية المعلنة تلقائياً. فقط أيام العمل الفعلية هي التي تخصم من رصيدك.",
    },
  ];

  const managerFaqs: FaqItem[] = [
    {
      q: "If I am absent or on leave, who approves my employees' leave requests?",
      qAr: "إذا كنت في إجازة أو غائباً، من يعتمد طلبات إجازات موظفي فريقي؟",
      a: "Employees can select up to 2 designated reporting line approvers when submitting a request. If you are absent, the second designated manager can review and approve it. In urgent cases where no designated manager is available, HR administrators have system-wide override authority to approve or reject requests on your behalf.",
      aAr: "يمكن للموظف اختيار حتى معتمدين اثنين (Reporting Line Approvers) عند تقديم الطلب. في حال غيابك، يمكن للمدير المعتمد الثاني مراجعة الطلب واعتماده فوراً. وفي الحالات الطارئة التي يتعذر فيها وصول المعتمدين، يملك مسؤولو HR صلاحية اعتماد استثنائية لإنهاء الطلب.",
    },
    {
      q: "Why do I receive email notifications for leave requests if I am not the designated approver?",
      qAr: "لماذا أتلقى إشعارات بريد لطلبات إجازة لا أملك صلاحية اعتمادها؟",
      a: "When an employee submits a leave request, all assigned reporting lines (ReportLine 1 through 6) receive automated notification emails for school awareness and timetable planning. However, only the 1 or 2 managers explicitly selected by the employee as approvers have the action buttons to Approve or Reject. In the portal, non-selected managers will see 'View only — another Reporting Line was selected'.",
      aAr: "عندما يقدم الموظف طلب إجازة، ترسل إشعارات بريد آلية لجميع خطوط التقارير المعينة له (من 1 إلى 6) للعلم وتنسيق الجداول المدرسية. لكن الأزرار الفعلية للاعتماد أو الرفض تقتصر فقط على المدير أو المديرين اللذين حددهما الموظف للاعتماد (حتى 2). ويرى بقية المشرفين في البوابة تنبيه 'View only'.",
    },
    {
      q: "Can I change an approval decision after I submit it?",
      qAr: "هل يمكنني التراجع عن قرار الاعتماد أو الرفض بعد تسجيله؟",
      a: "No. Once a leave request is marked Approved or Rejected, the decision is logged in the audit trail and cannot be changed by the manager. If a change is needed (for example, if the employee cancelled their plans or returned to school early), contact HR to adjust or cancel the leave.",
      aAr: "لا. بمجرد تسجيل قرار الاعتماد أو الرفض، يسجل القرار في سجل النظام ولا يمكن للمدير تغييره بنفسه. إذا استجد أي تعديل (مثل عودة الموظف مبكراً أو إلغاء سفره)، يرجى التواصل مع إدارة HR لإلغاء الإجازة أو تعديل تواريخها.",
    },
    {
      q: "Can I approve my own leave request?",
      qAr: "هل يمكنني اعتماد طلب إجازتي الشخصية؟",
      a: "No. Managers cannot approve their own leave requests. When you submit a leave request through 'Submit Leave Request', you must select your own direct reporting lines (e.g. Stage Director, Principal, or HR Director) to review and approve it.",
      aAr: "لا. لا يمكن لأي مدير اعتماد طلب إجازته الخاصة. عند تقديم إجازتك من صفحة 'Submit Leave Request'، يجب عليك اختيار مديرك المباشر أو مدير المرحلة المعتمد في ملفك لاعتمادها.",
    },
    {
      q: "Why do I only see some staff members in Employee Management and Attendance Logs?",
      qAr: "لماذا يظهر لي بعض الموظفين فقط في إدارة الموظفين وسجلات الحضور؟",
      a: "As a manager, your portal view is filtered to show only employees who have your email address or employee ID assigned in one of their reporting lines (ReportLine 1 to 6). If a team member is missing from your list, ask HR to update their employee profile with your reporting line.",
      aAr: "بصفتك مديراً، يتم تصفية البيانات في حسابك لتعرض فقط الموظفين المسجل في ملفاتهم بريدك أو كودك ضمن خطوط التقارير (ReportLine 1 إلى 6). إذا كان هناك موظف في فريقك لا يظهر في قائمتك، اطلب من HR إضافة بياناتك في خطوط تقاريره.",
    },
  ];


  // Organize groups based on active tab
  const groupsToDisplay: GuideGroup[] = useMemo(() => {
    if (activeTab === "getting-started") {
      return [
        {
          id: "getting-started-group",
          title: "Getting started",
          titleAr: "البداية والأساسيات",
          subtitle: "The basics every user needs.",
          subtitleAr: "الأساسيات التي يحتاجها كل مستخدم.",
          guides: gettingStartedGuides,
        },
      ];
    }

    if (activeTab === "employees") {
      return [
        {
          id: "leave-excuses-group",
          title: "Leave & excuses",
          titleAr: "الإجازات والأذونات",
          subtitle: "Balances, requests and approvals.",
          subtitleAr: "الأرصدة، تقديم الطلبات والاعتمادات.",
          guides: employeeLeaveGuides,
        },
        {
          id: "hr-docs-group",
          title: "HR documents",
          titleAr: "المستندات والشهادات الرسمية",
          subtitle: "Certificates and official letters.",
          subtitleAr: "الشهادات والخطابات الرسمية.",
          guides: employeeDocumentGuides,
        },
      ];
    }

    if (activeTab === "managers") {
      return [
        {
          id: "managers-leave-group",
          title: "Leave approvals & decisions",
          titleAr: "اعتمادات وقرارات الإجازات",
          subtitle: "Reviewing requests, approver delegation and coverage planning.",
          subtitleAr: "مراجعة الطلبات، قواعد تفويض المعتمدين، وترتيب تغطية الجداول.",
          guides: managerLeaveGuides,
        },
        {
          id: "managers-team-group",
          title: "Team directory & attendance",
          titleAr: "دليل الفريق ومتابعة الحضور",
          subtitle: "Subordinate directory, daily attendance tracking, and report exports.",
          subtitleAr: "دليل الموظفين التابعين، متابعة سجلات الحضور اليومي، وتصدير التقارير.",
          guides: managerTeamGuides,
        },
      ];
    }

    return [];
  }, [activeTab]);

  // Current FAQs based on active tab
  const currentFaqs = useMemo(() => {
    if (activeTab === "employees") return employeeFaqs;
    if (activeTab === "managers") return managerFaqs;
    return gettingStartedFaqs;
  }, [activeTab]);

  // Filter groups by search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupsToDisplay;
    const lower = searchQuery.toLowerCase().trim();

    return groupsToDisplay
      .map((group) => {
        const matchingGuides = group.guides.filter(
          (g) =>
            g.title.toLowerCase().includes(lower) ||
            g.titleAr.includes(lower) ||
            g.summary.toLowerCase().includes(lower) ||
            g.summaryAr.includes(lower) ||
            g.steps.some(
              (s) =>
                s.text.toLowerCase().includes(lower) ||
                s.textAr.includes(lower)
            )
        );
        return {
          ...group,
          guides: matchingGuides,
        };
      })
      .filter((group) => group.guides.length > 0);
  }, [groupsToDisplay, searchQuery]);

  return (
    <AppLayout>
      <div
        className={`max-w-5xl mx-auto space-y-6 pb-20 ${
          isRTL ? "text-right font-sans" : "text-left"
        }`}
        dir={isRTL ? "rtl" : "ltr"}
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {lang === "en" ? "How to Use the HR Portal" : "دليل استخدام بوابة الموارد البشرية"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {lang === "en"
                ? "Step-by-step guides for every task in the portal. Pick your section, search for a task, and follow the numbered steps."
                : "إرشادات خطوة بخطوة لكل عملية في البوابة. اختر القسم، وابحث عن الخدمة، واتبع الخطوات المرقمة."}
            </p>
          </div>

          {/* Language Switcher */}
          <div className="flex items-center self-start sm:self-auto rounded-lg border bg-background p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => handleLangChange("en")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                lang === "en"
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => handleLangChange("ar")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                lang === "ar"
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              العربية
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search
            className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${
              isRTL ? "right-3.5" : "left-3.5"
            }`}
          />
          <Input
            type="text"
            placeholder={
              lang === "en"
                ? 'Search guides — e.g. "leave", "salary certificate", "password"'
                : 'ابحث في الدليل — مثل "إجازة"، "شهادة راتب"، "كلمة المرور"'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`h-11 rounded-lg bg-background text-sm shadow-2xs ${
              isRTL ? "pr-10 pl-4" : "pl-10 pr-4"
            }`}
          />
        </div>

        {/* Section Pill Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("getting-started")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "getting-started"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {lang === "en" ? "Getting started" : "البداية والأساسيات"}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("employees")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "employees"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {lang === "en" ? "Employees" : "الموظفون"}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("managers")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "managers"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {lang === "en" ? "Managers" : "المديرون"}
          </button>
        </div>

        {/* Subtitle under tabs matching Image */}
        <p className="text-xs sm:text-sm text-muted-foreground">
          {activeTab === "getting-started" &&
            (lang === "en"
              ? "For everyone: sign in, move around the portal, notifications, Dashboard and your profile."
              : "لكل مستخدم: تسجيل الدخول، تصفح البوابة، الإشعارات، لوحة التحكم، والملف الشخصي.")}
          {activeTab === "employees" &&
            (lang === "en"
              ? "Your own leave, documents and attendance. Managers and HR use these for their own requests too."
              : "إجازاتك ومستنداتك وحضورك الخاص. يستخدم المديرون ومسؤولو HR هذه الأدوات لطلباتهم الشخصية أيضاً.")}
          {activeTab === "managers" &&
            (lang === "en"
              ? "For managers: review, approve, or reject employee leave requests and track your team."
              : "للمديرين: مراجعة واعتماد أو رفض طلبات إجازات الموظفين ومتابعة الفريق.")}
        </p>

        {/* Guide Cards (Support multiple cards for Employees tab: Leave & Excuses + HR Documents) */}
        {filteredGroups.length === 0 ? (
          <Card className="border rounded-xl shadow-xs overflow-hidden p-8 text-center text-sm text-muted-foreground">
            {lang === "en"
              ? "No guides found matching your search. Try different keywords."
              : "لم يتم العثور على نتائج مطابقة لبحثك. جرب كلمات بحث أخرى."}
          </Card>
        ) : (
          filteredGroups.map((group) => (
            <Card key={group.id} className="border rounded-xl shadow-xs overflow-hidden">
              <CardHeader className="border-b bg-background/50 pb-4">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg font-bold">
                    {lang === "en" ? group.title : group.titleAr}
                  </CardTitle>
                  <Badge variant="secondary" className="rounded-full px-2 py-0 text-xs font-semibold">
                    {group.guides.length}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {lang === "en" ? group.subtitle : group.subtitleAr}
                </p>
              </CardHeader>

              <CardContent className="p-0">
                <Accordion type="single" collapsible className="w-full">
                  {group.guides.map((guide) => (
                    <AccordionItem
                      key={guide.id}
                      value={guide.id}
                      className="border-b last:border-b-0 px-6 py-1 transition-colors hover:bg-muted/20"
                    >
                      <AccordionTrigger className="hover:no-underline py-4 text-left">
                        <div className={`space-y-1 pr-4 ${isRTL ? "text-right pl-4 pr-0" : "text-left"}`}>
                          <h3 className="text-sm font-semibold text-foreground">
                            {lang === "en" ? guide.title : guide.titleAr}
                          </h3>
                          <p className="text-xs text-muted-foreground font-normal">
                            {lang === "en" ? guide.summary : guide.summaryAr}
                          </p>
                        </div>
                      </AccordionTrigger>

                      <AccordionContent className="pt-2 pb-6 space-y-5">
                        {/* Open this page button */}
                        {guide.pageRoute && (
                          <div className="pt-1">
                            <Button asChild size="sm" className="bg-slate-700 hover:bg-slate-800 text-white gap-1.5 text-xs h-8 px-3 rounded-md">
                              <Link href={guide.pageRoute}>
                                <span>{lang === "en" ? "Open this page" : "فتح هذه الصفحة"}</span>
                                <span className="text-slate-300 font-mono text-[11px]">{guide.pageRoute}</span>
                              </Link>
                            </Button>
                          </div>
                        )}

                        {/* Steps */}
                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-foreground">
                            {lang === "en" ? "Steps" : "الخطوات"}
                          </h4>

                          <div className="space-y-3">
                            {guide.steps.map((step, sIdx) => (
                              <div key={sIdx} className="space-y-2">
                                <div className="flex items-start gap-2.5">
                                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-slate-700 text-white text-[11px] font-bold shrink-0 mt-0.5">
                                    {sIdx + 1}
                                  </span>
                                  <p className="text-xs sm:text-sm text-foreground leading-relaxed">
                                    {lang === "en" ? step.text : step.textAr}
                                  </p>
                                </div>

                                {step.callout && (
                                  <div className="ml-7 mr-2 p-3 rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                                    {lang === "en" ? step.callout : step.calloutAr}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Rules & Limits */}
                        {guide.rulesAndLimits && (
                          <div className="space-y-2 pt-2">
                            <h4 className="text-sm font-semibold text-foreground">
                              {lang === "en" ? "Rules & limits" : "القواعد والضوابط"}
                            </h4>
                            <ul className="space-y-1.5 list-disc list-outside pl-4 text-xs text-muted-foreground leading-relaxed">
                              {(lang === "en" ? guide.rulesAndLimits.en : guide.rulesAndLimits.ar).map((rule, rIdx) => (
                                <li key={rIdx}>{rule}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Troubleshooting Table */}
                        {guide.troubleshooting && guide.troubleshooting.length > 0 && (
                          <div className="space-y-2 pt-2">
                            <h4 className="text-sm font-semibold text-foreground">
                              {lang === "en" ? "If something goes wrong" : "إذا واجهتك مشكلة"}
                            </h4>

                            <div className="border rounded-lg overflow-hidden text-xs">
                              <table className="w-full text-left">
                                <thead className="bg-slate-100 dark:bg-slate-800 border-b">
                                  <tr>
                                    <th className={`px-3 py-2 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px] w-5/12 ${isRTL ? "text-right" : "text-left"}`}>
                                      {lang === "en" ? "YOU SEE" : "ما يظهر لك"}
                                    </th>
                                    <th className={`px-3 py-2 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px] w-7/12 ${isRTL ? "text-right" : "text-left"}`}>
                                      {lang === "en" ? "WHAT TO DO" : "ما يجب فعله"}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {guide.troubleshooting.map((issue, iIdx) => (
                                    <tr key={iIdx} className="border-b last:border-b-0 hover:bg-muted/30">
                                      <td className={`px-3 py-2.5 font-medium text-foreground align-top ${isRTL ? "text-right" : "text-left"}`}>
                                        {lang === "en" ? issue.youSee : issue.youSeeAr}
                                      </td>
                                      <td className={`px-3 py-2.5 text-muted-foreground align-top leading-relaxed ${isRTL ? "text-right" : "text-left"}`}>
                                        {lang === "en" ? issue.whatToDo : issue.whatToDoAr}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Tips */}
                        {guide.tips && (
                          <div className="p-4 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 text-xs text-sky-900 dark:text-sky-200 space-y-2">
                            <h5 className="font-bold text-sm text-sky-900 dark:text-sky-200">
                              {lang === "en" ? "Tips" : "نصائح وإرشادات"}
                            </h5>
                            <ul className="space-y-1.5 list-disc list-outside pl-4 leading-relaxed">
                              {(lang === "en" ? guide.tips.en : guide.tips.ar).map((tip, tIdx) => (
                                <li key={tIdx}>{tip}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          ))
        )}

        {/* Frequently Asked Questions Card matching latest Screenshot */}
        <Card className="border rounded-xl shadow-xs overflow-hidden">
          <CardHeader className="border-b bg-background/50 pb-4">
            <CardTitle className="text-base sm:text-lg font-bold">
              {lang === "en" ? "Frequently asked questions" : "الأسئلة الشائعة"}
            </CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            <Accordion type="single" collapsible className="w-full">
              {currentFaqs.map((faq, fIdx) => (
                <AccordionItem
                  key={fIdx}
                  value={`faq-${fIdx}`}
                  className="border-b last:border-b-0 px-6 py-1 transition-colors hover:bg-muted/20"
                >
                  <AccordionTrigger className="hover:no-underline py-4 text-left">
                    <span className={`text-sm font-semibold text-foreground pr-4 ${isRTL ? "text-right pl-4 pr-0" : "text-left"}`}>
                      {isRTL ? "◀ " : "▶ "}
                      {lang === "en" ? faq.q : faq.qAr}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pt-0 pb-4 text-xs sm:text-sm text-muted-foreground leading-relaxed pl-4 pr-4">
                    {lang === "en" ? faq.a : faq.aAr}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
