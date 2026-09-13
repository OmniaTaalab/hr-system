/**
 * Bulk-deactivate ONLY the employee IDs in TARGETS.
 * Dry-run (default):  npx tsx scripts/deactivate-employees.ts
 * Apply:              npx tsx scripts/deactivate-employees.ts --apply
 */
import admin from "firebase-admin";
import { adminAuth, adminDb } from "../src/lib/firebase/admin-config";

const APPLY = process.argv.includes("--apply");

const LEAVING_DATE = new Date();
const REASON = "Other";
const REASON_NOTE =
  "Bulk deactivation of leftover / inactive employee accounts requested by HR.";
const ACTOR_EMAIL = "hr-bulk-script@system";
const ACTOR_ROLE = "hr";

/** Employee ID + expected name. Script never touches anyone outside this list. */
const TARGETS: Array<[string, string]> = [
  ["1304", "Alaa Atef Aziz"],
  ["1335", "Damian Charpentier"],
  ["1720", "Basma ElNady"],
  ["202132456789", "ola ola"],
  ["2141", "Mohamed Mohsen Ahmed Ibrahim"],
  ["2251", "Heba Allah Safwat"],
  ["2350", "Habiba Mohamed El Sherif Ahmed Ewis"],
  ["2368", "Hana Khaled Mostafa Fahmy Namy"],
  ["2424", "Kathleen O'Neil"],
  ["2721", "Sara Karim Sabry"],
  ["2945", "Mohamed Youssef Ramdan Roza"],
  ["3034", "Reham Gamal Jilani Sagheer Mohamed"],
  ["3035", "Nada Ismail"],
  ["3118", "Mahmoud Ramadan Mahmoud El Sayed"],
  ["3124", "Mennatullah Mohsen Ali Youssef Afifi"],
  ["3131", "Rewan Emad Ali Abady Nour el din"],
  ["3176", "Shaimaa Gamal Fahmy Mohamed"],
  ["3235", "Soliman Ragab Soliman El Kady"],
  ["3399", "Mohga Essam Hamza"],
  ["3418", "Marwa Mohsen El Kasabgy"],
  ["3568", "Passant Hassan Abdel Aal"],
  ["3814", "Ahmed Mohamed Kamal"],
  ["3823", "Bishoy Saad Guindy"],
  ["3878", "May El Badry"],
  ["3978", "Salma Emad Helmy Mohamed Ibrahim"],
  ["4074", "Haya Mohamed Mohamed Elbarbary"],
  ["4117", "Mohamed El Ameen Abdel Aziz Mohamed"],
  ["4433", "Malak Sherif Ibrahim Mekhamar"],
  ["4449", "Sharifa Yasser Kamal Gamei Hashem"],
  ["4464", "Mina Fahim Antoun Farid Kozman"],
  ["4488", "Nouran Anwar Ahmed Ibrahim Shokry"],
  ["5183", "Sara Ahmed AbdelHalim El Sayed"],
  ["5195", "Nourhan Mamdouh Ibrahim Abdel Samad"],
  ["5314", "Mennatullah Ahmed Mohamed Mohamed Rasheed"],
  ["5320", "Nourhan Abdallah Mohamed Badda"],
  ["5421", "Logina Gamal Mohamed Samy El Haddad"],
  ["5443", "Mariam Amthal"],
  ["5467", "Dina Ahmed Mohamed Gamil Hassan"],
  ["5503", "Mohamed Abdel Razik Mohamed"],
  ["5535", "Mennatullah Tarek El sayed Fahmy Khattab"],
  ["5566", "Bassant Ashraf Mohamed Awad"],
  ["5593", "May Issa Ismail"],
  ["5667", "Hana Wael Ramadan Ahmed Ibrahim"],
  ["5675", "Noha Ahmed Mohamed Ahmed"],
  ["5775", "Lobna Hossam Saad Mostafa"],
  ["5811", "Shada Magdy Ahmed Mohamed Ali"],
  ["5814", "Noura Mohamed AbdelAziz Abdel Hady"],
  ["6024", "Samaa Hosny Ahmed El Sayed Mashaal"],
  ["6048", "Asmaa Hisham Ibrahim Abu Hadima"],
  ["6067", "Nadia Abdelazim Abdelazim Hassan Gabr"],
  ["6262", "Sara Kotb Ibrahim Kotb El Shamy"],
  ["63", "Ahmed Mamdouh Aly Hegazy"],
  ["6336", "Yara Mohamed Abdel Azim Mohamed Ibrahim El Robeigy"],
  ["6338", "Nermien Abd Rabou Abdel Hakim El Sawy"],
  ["6363", "Dina Mohamed Maher Mady"],
  ["6377", "Ghadeer Abdel Fattah Sayed Ahmed Azzam"],
  ["6398", "Mostafa Mohamed Essam Mohamed Kamal El Deen Shaat"],
  ["6399", "Rwan Walaa Adel Bibers"],
  ["6413", "Nourhan Hassan Youssef Ibrahim"],
  ["6422", "Amal AbdelKhalik Abdellatif Kedr"],
  ["6423", "Nada Yasser Fathy Sherif"],
  ["6424", "Karim Omar AbdelMoniem El Shamekh"],
  ["6440", "Merna Ahmed Saad Abu El Leil"],
  ["6458", "Hebatullah Hani AbdelHamid El Wakil"],
  ["6478", "Alaa Tarek Abdelsalam Gharib"],
  ["6515", "Belal Mohamed Ibrahim Gaballah"],
  ["6520", "Asmaa Mohamed Awad Bashir"],
  ["6521", "Dina Hazem Mohamed AbdelMoniem Hosny"],
  ["6530", "Moneeb Hassan Taha Hussein Huseein"],
  ["6549", "Eman AbdelMoniem Ahmed Mohamed Manosur"],
  ["6569", "Ahmed Ramadan Aly Mohamed AbdElla"],
  ["6641", "Yasmine Abu El Ela Mohamed Mahmoud"],
  ["6657", "Ragy Waheed Hamdy Ahmed Eska"],
  ["6660", "Nadine Hamdy Mahmoud Ibrahim Sharkawy"],
  ["6721", "Nesma Saied El Sayed Soliman"],
  ["6743", "Nermeen Nader Mohamed Abd Elrazik Abd Elrahman"],
  ["6754", "Miran Mahmoud El Maghawry Ahmed"],
  ["6765", "Samaa Sameh El Saied Negm"],
  ["6779", "Aya AbdelNasser Khalifa Ali"],
  ["6785", "Roaa Hassan Hassan Shaaban El Haddad"],
  ["6787", "Yara Ibrahim Ahmed Ibrahim Abaza"],
  ["6791", "Farida Hesham Mohamed Helmy Hegazy"],
  ["6801", "Habiba Mohamed Moawad El Geddawy Nasr"],
  ["6804", "Hossam Mohamed Hanafy Mahmoud Shokry"],
  ["6808", "Nada Salah Ali Sanad"],
  ["6820", "Farah Abdel Hamid Ahmed Fahmy Salouma"],
  ["6821", "Samira Yehia Zakareya Ibrahim"],
  ["6826", "Hadeel Mohamed Mostafa Amin Helal"],
  ["6829", "Passant Mohamed Abderehim Kadry Abo El Eneen"],
  ["6831", "Rwayda Wael Mohamed Salah El Deen"],
  ["6833", "Noura Ezz El Din Hussein Mohamed"],
  ["6835", "Doaa Mohamed Mostafa Kamel Khairy"],
  ["6839", "Samar Khalifa Hussein Khalifa"],
  ["6840", "Zahraa El Islam Moaz Mohamed Hammam"],
  ["6842", "Doaa Mourad Hassan Mourad"],
  ["6846", "Malak El Sayed Ibrahim Mounir Azzouz"],
  ["6856", "Aya Mahmoud Abdel Hafez Mohamed"],
  ["6865", "Mennatullah Ihab Mohamed Ahmed Abdel Wahab"],
  ["6866", "Fatma El Zahraa Essam El Din Saad El Din Abdel Aziz"],
  ["6870", "Mahmoud Ahmed Mostafa Ahmed Hammam Hassan"],
  ["6899", "Mariam Mohamed El Sadek AbdelGayed Ibrahim"],
  ["6982", "Nour Mahmoud Abdel Aziz Mahmoud"],
  ["6996", "Habiba Osama Mahmoud Ahmed Emam"],
  ["7014", "Shahd Khaled Mahmoud Mohamed El Basha"],
  ["7016", "Hannah Samir Yehia Khalifa El Sayed"],
  ["7017", "Yara Mahmoud Mohamed El Sayed"],
  ["7044", "Mayar Tarek Mahmoud Abdel Latif"],
  ["7047", "Noha Ahmed Helmy Saad Zaghloul Ahmed Helmy"],
  ["7048", "Ramadan Mohamed Mohamed Metwally"],
  ["7064", "Jana Usama Kamel Abdel Latif"],
  ["7076", "Yousry Mohamed Yousry Ahmed"],
  ["7081", "Ingy Khaled Abdel Aziz Soliman Sayed Ahmed"],
  ["7082", "Waad Ahmed Farouk Shahin Ibrahim"],
  ["7097", "Mennatallah Khaled Essam El Din"],
  ["7100", "Ahmed Mesbah Mohamed Mohamed"],
  ["7110", "Omnia Salah AbdelSamiea Abdelrazik"],
  ["7115", "Amena Ahmed Ibrahim El Sayed Mahaba"],
  ["7120", "Marina Sobhy yacoub Georgy"],
  ["7137", "Esraa Nader Mohamed Ragab El Samrour"],
  ["7153", "Elizabeth Anna Wlodek"],
  ["7154", "Mohamed Abdel Mohsen Ewis Mostafa"],
  ["7169", "Dalia Mohamed Mostafa Ahmed Ghobashy"],
  ["7197", "Alaa Mohamed AbdelHakim Mohamed Sorour"],
  ["7211", "Hla Mohamed Mohamed Ibrahim Shatat"],
  ["7222", "Rodaina Mohamed El Sayed Mohamed El Imam"],
  ["7224", "Roaa Gaber Abdel Hafez Khedr Malek"],
  ["7231", "Anas Yasser Fekry Ameen"],
  ["7236", "Nermeen Tawfik Metwally Tawfik"],
  ["7246", "Eman Osama Ahmed Mohamed Ali"],
  ["7260", "Mennatullah Aziz Mahmoud Kamel Soliman"],
  ["7261", "Farah Wael Fouad Mohamed Nour El Hoda"],
  ["7270", "Nehal El Sayed Fadl Farag allah Mohamed"],
  ["7279", "Nermin Mohamed El Tayebi"],
  ["7280", "Nadina Khaled Hamdy Mahmoud Sabry"],
  ["7305", "Maha Mohamed Abbas El Shamaa"],
  ["7309", "Amany Mohamed Ahmed Hassan"],
  ["7314", "Khadija Hazem Mohamed Yousry Zaki Abdel Rahman"],
  ["7328", "Ahmed Ragab El Sayed Soliman"],
  ["7335", "Nouran Reda Mohamed Mahmoud Adam"],
  ["7343", "Sarah Kamel Mohamed Marzouk AbdelHamid"],
  ["7348", "AbdelAziz Ahmed Mohamed Farghaly Abdelhamid"],
  ["7349", "Amira Hosny Mohamed Shams El Din"],
  ["7357", "Heba Salah El Din Abdelrahman Ahmed"],
  ["7367", "Ebtihal Mohamed Abdelrahman El Sehity"],
  ["7377", "Nariman Osama Abdelmoniem Saeed Abdelrahman"],
  ["7379", "Moataz Ashraf Awad Abdo Eid"],
  ["7389", "Toqa Tamer Roshdy Sayed Ahmed"],
  ["7393", "Ahmed Mahmoud Mohamed Sayed Ibrahim"],
  ["7395", "Amany Ahmed Marie Karim"],
  ["7404", "Nelly Mohamed Nagy Saad El Behairy"],
  ["7406", "Abdelrahman Abdellatif Abdelgawad Mabrouk"],
  ["7408", "Mohamed Wahid Hefny Bekhit"],
  ["7412", "Nourhan Hamdy Yassin Hamam"],
  ["7414", "Sagda Sayed Ahmed Mohamed Sayed Ahmed"],
  ["7417", "Dina Hossam El Din Nahed Mostafa Fawzy"],
  ["7422", "Nourhan Mohamed Mohamed Ahmed Mohamed Mansour"],
  ["7423", "Mai Mohamed Mahmoud"],
  ["7424", "Aya Salah Rabea Morsi"],
  ["7426", "Ola Mahmoud Mohamed AbdelAal"],
  ["7433", "Semnar Eliseo Hizon Andrade"],
  ["7438", "Khaled El Sayed Mokhtar Ahmed El Mahlawy"],
  ["7440", "Youssef Wael Mohamed Ibrahim Shehata"],
  ["7442", "Laila Abu Samhadana"],
  ["7443", "Mai Ismail Mohamed Faek Abdel Aziz"],
  ["7450", "Menna Nasr El Harouny"],
  ["7451", "Omnia Nabil Mohamed Morgan"],
  ["7466", "Soha Hassan Diab Ali"],
  ["7472", "Jasmin Gharib Mahmoud Abdelkader"],
  ["7477", "Dalia Ibrahim Nemr Abo El Sheikh"],
  ["7481", "Nariman Sayed Imam Mohamed"],
  ["7483", "Nour Ahmed Said Sayed"],
  ["7490", "Youssef Mohamed AbdelHalim Abdel Lahalim Abu Zeid"],
  ["7510", "Nourallah Khaled Ahmed El Gendy"],
  ["7517", "Reham Aly Abo Kassem"],
  ["7523", "Sara Saad Ahmed Sobhy"],
  ["7526", "Rania Saeed Mohamed Metwally"],
  ["7538", "Abdelrahman Amr Abdelrahman Mohamed"],
  ["7539", "Maha Samir Mohamed AbdelAziz El Zokom"],
  ["7540", "Maha Nasser Ismail"],
  ["7543", "Gharam Mohamed Ibrahim"],
  ["7544", "Nourhan Ahmed Mohamed Mohamed Ahmed"],
  ["7545", "Tasneem Hamdan Mahmoud"],
  ["7549", "Mariam Mohamed Anwar Elshafie"],
  ["7552", "Esraa Ali Mohamed Thabet Abdel Rahman"],
  ["7558", "Sama Mansour Hussien"],
  ["7562", "Noha Fathy Ahmed Heraiba"],
  ["7644", "Esraa Mohamed Ramdan Hussien"],
  ["7645", "Rana Rafik Tawfik Khalil"],
  ["7648", "Aya Fouad Ahmed Abd El Rahman"],
  ["7651", "Nourhan Ashraf Arafa Ali"],
  ["7659", "Alaa Abdel Azim Soliman Beshr Mohamed Amer"],
  ["7671", "Mohamed Mosad Mohamed Hassan"],
  ["7675", "Farah Mostafa Abdelraouf Kamel"],
  ["7676", "Nourhan Reda Ahmed Ahmed El Badry"],
  ["7677", "Mohamed Ali Ibrahim Ismail"],
  ["7679", "Dina AbdelHalim Ibrahim AbouShehata"],
  ["7683", "Rona Ehab Mahmoud Saqr"],
  ["7697", "Shereen Mahmoud Yehia Mahmoud"],
  ["7706", "Yasmine Samir Mohamed Ali"],
  ["7716", "Akram Ayman Fouad Ahmed"],
  ["7737", "Petra Nady Fawzy Amin Gerges"],
  ["7744", "Nourhan Adel Abd Elrahman Abd Elsamei"],
  ["7745", "Sondos salah el din mohamed abd el hameed"],
  ["7759", "Ruba Ayman Saber Aly Mohamed"],
  ["7817", "Fatin Samir Ragheb Nashed"],
  ["7835", "Farah Ahmed Aly Gomaa"],
  ["7872", "Mariam Mahmoud Ahmed El Gamal"],
  ["7879", "Nadine Ahmed Abd Elfattah Ahmed Shehata"],
  ["7881", "Osama Ali Khalil Ali"],
  ["7887", "Amr El Sayed Abdel Karim El Sayed El Azzazy"],
  ["7902", "Dina Talaat Mounir Ali Hussien"],
  ["7915", "Rana Sherif Raafat Mahmoud El Tersawy"],
  ["7926", "Ahmed Hamdy Sayed Ahmed Ghoniem"],
  ["7942", "Maryam Mohamed Sherine Ahmed labib Dorrah"],
  ["7945", "Nehad Hassan El Sayed Awad"],
  ["7951", "Rawda Sayed Mohamed Abdul Ghaffar"],
  ["7953", "Mai Mohamed Soliman Hamed"],
  ["7954", "Angham Khalaf Abdallah Soltan"],
  ["7956", "Dareen Adel Mohamed Mahmoud Ahmed"],
  ["7963", "Hala Mahmoud Ahmed Abdelfattah"],
  ["7966", "Ola Arafaa Ahmed Ashour"],
  ["7978", "Rana Hossam El Din Abdel aziz Mohamed Gaafer"],
  ["7979", "Lamis Khaled Mahmoud Reda Abbas"],
  ["7988", "Yasmine Shabaan Ahmed Agamy"],
  ["7992", "Magi Magdi Shukralla Ghattas"],
  ["7995", "Heba Ahmed Alaa Eldin Abd Elaal Zidan Abo Zaid"],
  ["7996", "Hana Hossam SalahEldin Taha"],
  ["8007", "Amany Osama Ibrahim Safary"],
  ["8046", "aya hatim ibrahem mohamed"],
  ["8105", "Mona Nabil Mohamed Mostafa"],
  ["1050", "Zeinab Mostafa Abd Eisamiaa Mahmoud"],
  ["1055", "Karim Maged Abdel Malak Saleb"],
  ["1093", "Inas Seyam Abdelhalim Lotfy"],
  ["1230", "Gihan Mohamed Alaa"],
  ["1269", "Ashraf magdy amin"],
  ["1317", "Evon Safwat Basta"],
  ["1419", "Amani Ibrahim Ahmed El Sayed"],
  ["1486", "May Ashraf Fawzy AbdelKader"],
  ["1521", "Yara Adel AbdelMoniem Ghannam"],
  ["1542", "Gehan Sherif Hassan Darwish"],
  ["1571", "Asmaa Mohamed Hassan Awadallah"],
  ["1581", "Nouran Mahmoud Ahmed Mahmoud Hekal"],
  ["1705", "Khaled Samir Madkour Abdelsalam"],
  ["1719", "Gihan Hassan Mahmoud Hassan"],
  ["1828", "Rana Mahmoud Mohamed El Zaki"],
  ["1855", "Mohamed Abdellah Mohamed Refaay Sharkawy"],
  ["2077", "amira abdalla zaky Mohamed Hassan"],
  ["2189", "Heba Abdel Hamid Ahmed Shalaby"],
  ["2303", "Mehan Mohy Eldin Mahmoud Ali"],
  ["2359", "Sharif Sayed Zaki Ahmad"],
  ["2490", "Marwa ahmed Mohamed Ahmed othman"],
  ["2534", "Fella Hamza Massrali"],
  ["2877", "Mohamed Hamada Abdelrahman"],
  ["2892", "Passant Ahmed Fouad Mohamed Mohieldin Kandil"],
  ["2919", "Kholoud Hamed Hussein Beshir"],
  ["2965", "Nehad Hendawy Mohamed"],
  ["3168", "Mohamed Elsawy Mohamed Ibrahim"],
  ["3199", "Heba Abd-Elhamed Mostafa Abdallah Shawer"],
  ["3200", "Noha Galal Bakry Ragab"],
  ["3362", "Gehane Antar Mahmoud Antar"],
  ["3704", "Khaled Ibrahim Abdel Ghaffar Elasrag"],
  ["3866", "Mai Abd Elaziz Saeid Abou Elsaad"],
  ["3884", "Samar Ahmed Abd Elnaem Moslhy"],
  ["3892", "Basma Youssef Awad Ibrahim"],
  ["3903", "Karem Mostafa Hamza Abd elragal"],
  ["4009", "Nourhan Mostafa Saad Mohamed"],
  ["4031", "Enas Anwar Mohamed Seleim"],
  ["4083", "Sara Abo elsaod abdelaziz Mansour"],
  ["4166", "Esraa Mounir Ahmed Hassan"],
  ["4289", "Amira Ahmed Mahmoud Ali"],
  ["4332", "Alaa Medhat Shawky Mohamed Mounib"],
  ["4341", "Salma Adel Fathy Dardeer"],
  ["4344", "Yassmine Reda Bahgat Abdelaziz"],
  ["4345", "Dahlia Hossam Elsayed zikry"],
  ["4351", "Nada Magdy Ahmed Attia"],
  ["4372", "Marwa Mohamed Gamal El Saeed"],
  ["4373", "Hajar Akrum Zain El-Abedeen Mahmoud Mohamed Hamdy"],
  ["5089", "Mohsen Ahmed qandel Salem"],
  ["5114", "Amira Mohamed Mohamed khalifa"],
  ["5149", "Yara Husseini Fadel Ghoma Rageh"],
  ["5155", "Veronia Samir Selim Saweres Maged"],
  ["5191", "Dina ali zein ElAbden Mahmoud"],
  ["5208", "Yassmin Ashraf Abd Elmoneim Ibrahim Elboraay"],
  ["5240", "Nada Mohamed Gad Ibrahim"],
  ["5258", "Mohamedtaherfouda"],
  ["5356", "Yara Hossam Mostafa Zaatar"],
  ["5361", "Amira Mahmoud elsayed ahmed"],
  ["5422", "Norhan Hassan Abd El Malek Ibrahim Shalaby"],
  ["5459", "Noha Ehab Abdel Fattah Mohamed Younis"],
  ["5488", "Amira Mohamed Naguib Abd El-Qader Harras"],
  ["5656", "Ibrahim Mohamed Abdelaziz Elsaadny"],
  ["5696", "Ehab Gamal Mohamed Elagamy"],
  ["5723", "Amira Abdelaziz Galal Abdelaziz"],
  ["5761", "Hayam abdelmohsen emam Ibrahim"],
  ["5767", "Ahmed Ramadan Sayed Korany"],
  ["5791", "Mazen Magdy Abd El-Rehem Mahmoud El Sayed"],
  ["5982", "Sara tarek mohamed hanafi"],
  ["6132", "Esraa Ahmed Mohamed"],
  ["6265", "Aliaa Alaa Abdelrahman Mohamed Eltohamy"],
  ["6266", "Nancy Tarek Hassanein Mohamed Hassanein"],
  ["6268", "Mohamed Ahmed Mortada Nashed"],
  ["6279", "Sondos Mohamed Ahmed Ahmed"],
  ["6284", "Nashwa Essam Eldin Abdullah Attia"],
  ["6292", "Mohamed Mahmoud EL Imam EL Imam EL Halawani"],
  ["6323", "Mohamed Mosleh Shahata Ahmed Ellabban"],
  ["6329", "Menna tullah ehab ali"],
  ["6554", "Nehal Mohamed Ahmed Saleh"],
  ["6636", "Menna Allah Tarek Hassan El-Khaligy"],
  ["6708", "Yasmine ahmed attia Mohamed"],
  ["6891", "Hana Ahmed Mohamed Nassar"],
  ["6901", "Yasmin Adel Mohamed Hassan"],
  ["6904", "Nour Hesham Mahmoud Samy"],
  ["6914", "Mostafa Ahmed Desoky Mohamed"],
  ["6918", "Hasnaa El Hassan Omar Kadbani"],
  ["6919", "Youssef Louis Antoine Hechema"],
  ["6921", "Ahmed Hussein Hamam Ali"],
  ["6926", "Noha Tarek Osama Mohsen Amin"],
  ["6928", "Abdelrhman Arafa Fathy Mohamed"],
  ["6937", "Obaida Hassan Hassan Ali Saleh"],
  ["6939", "Youstina Yousry lotfy Halem"],
  ["6940", "Maha ahmed mohamed mostafa"],
  ["6954", "Omnya Ayman Ibrahim Mohamed"],
  ["6955", "Youssef Mohamed Abdeen Abdelhamid"],
  ["6967", "Sherif Ashour Aboud Mohamed"],
  ["7008", "Walaa Mohamed Abd elazeem Azab"],
  ["7040", "Dina Saeed Mohamed Sabry"],
  ["7084", "Heba Allah Ahmed Fahmy Abdl Motleb Shakshak"],
  ["7151", "Amr Thabet Zaki Ali"],
  ["7155", "Lama Mohamed Fathy Mohamed Ghoneim"],
  ["7163", "Samar Samuel Moussa Hana"],
  ["7170", "Somaya Arafa Ahmed Ali Amin"],
  ["7171", "Feryal Mohamed ahmed hisham"],
  ["7177", "Nourhan Mongy Abu El Fath Mohamed Amin"],
  ["7184", "Baraa Yasser Abdalla Hassan"],
  ["7244", "Mohamed Fotoh Fathi Bayoumi Elfakharany"],
  ["7257", "Nardine Nagy Akhnoukh Garas"],
  ["7263", "Karim Gomaa Soliman Hassan"],
  ["7268", "Karam Shendi Manaa Shendi"],
  ["7320", "Mohamed abeltawab salem Mohamed"],
  ["7333", "Ali Mohamed Abdelaal Mohamed"],
  ["7353", "Eslam Mohamed Ahmed Mohamed Khalil"],
  ["7364", "Yara magdy mohamed abdelmaksoud"],
  ["7567", "mahmoud adel sayed mohamed"],
  ["7568", "Nada Maher Mahran abdelghaffar"],
  ["7572", "Sherry Nagy Nasif Sawires"],
  ["7581", "Lamis Nabil Abdelhamid Elshahawy"],
  ["7587", "Rahma ahmed galal Mohamed"],
  ["7590", "Naglaa Fathy Ahmed Labib"],
  ["7594", "Ahmed Mohamed Abd Alhmeed Mahfouz"],
  ["7606", "Asmaa Ismail Salem Ahmed"],
  ["7607", "Aya Neiazy Khaled Khaled Eid"],
  ["7618", "Khaled Abdelhameed Dardeer Abou Taleb"],
  ["7620", "Mariam khaled ahmed Mohamed"],
  ["7628", "Omnia Sayed Hassan Mahmoud"],
  ["7635", "Tasneem Ashraf ibrahim Khalil"],
  ["7641", "ziad ali samir foud"],
  ["7653", "Menna Tallah Ehab Abdallah Mohamed"],
  ["7657", "Hend sayed Ahmed Elsayed Ahmed"],
  ["7662", "Dina osama osman said ahmed el gendy"],
  ["7682", "Yara hossam abdelmoteleb mohamed saafan"],
  ["7694", "Youssef Yasser Sayed Abdelazim"],
  ["7695", "Mahmoud Adel Maghawry Behiry"],
  ["7720", "Walaa Mohamed Eissa Ibrahim"],
  ["7727", "Maha Abd Elfattah Mohamed Bakr"],
  ["7746", "Gehan Waheed Rashad Hafez"],
  ["7769", "Rowan Ehab Fares Abdelsalam"],
  ["7773", "Abdo Sayed Ali Ahmed"],
  ["7788", "Mennatullah Ayman Mohammed Rashad Hassan Ali"],
  ["7804", "Esraa Mosaad Ahmed Mahmoud"],
  ["7863", "Ziad Magdy Mohamed Basunoy"],
  ["7874", "Noha El Sayed Hussein Basyouni"],
  ["7883", "Mostafa Amin Taha Ahmed Regal"],
  ["7891", "Marwa Hefzy Allah Ali Abdelaziz"],
  ["7903", "Ziad Mahmoud Mohamed Ahmed Hassan"],
  ["7905", "Ahmed Abdelkhalek Ahmed Kamal Shama"],
  ["8020", "Sohaila Mohamed Ahmed Mohamed El Gebrin"],
  ["8022", "Youstina Atef Asaad Riyad"],
  ["8027", "Yasmine Samy Mahmoud Omar"],
  ["9821", "Bothayna Ibrahim Rasheed Mohamed"],
];

function normalize(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function namesLikelyMatch(expected: string, actual: string): boolean {
  const a = normalize(expected);
  const b = normalize(actual);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const aTokens = a.match(/[a-z]{3,}/g) || [];
  const bTokens = b.match(/[a-z]{3,}/g) || [];
  const shared = aTokens.filter((token) => bTokens.includes(token));
  return shared.length >= 2;
}

async function findByEmployeeId(employeeId: string) {
  if (!adminDb) throw new Error("Firebase Admin Firestore is not configured.");
  const col = adminDb.collection("employee");
  const asString = await col.where("employeeId", "==", String(employeeId)).get();
  if (!asString.empty) return asString.docs;

  const asNumber = Number(employeeId);
  if (!Number.isNaN(asNumber) && String(asNumber) === String(employeeId)) {
    const numeric = await col.where("employeeId", "==", asNumber).get();
    if (!numeric.empty) return numeric.docs;
  }
  return [];
}

async function main() {
  if (!adminDb) {
    throw new Error("Firebase Admin Firestore is not configured.");
  }

  const allowedIds = new Set(TARGETS.map(([id]) => String(id)));
  console.log(APPLY ? "APPLY MODE — writes will happen" : "DRY RUN — no writes");
  console.log(`Targets: ${TARGETS.length}`);
  console.log(`Allowed IDs only: ${allowedIds.size}`);
  console.log(`Reason: ${REASON}`);
  console.log(`Note: ${REASON_NOTE}`);
  console.log("");

  const summary = {
    deactivated: 0,
    alreadyDeactivated: 0,
    notFound: 0,
    nameMismatchSkipped: 0,
    duplicates: 0,
    authDisabled: 0,
    errors: 0,
  };

  for (const [employeeId, expectedName] of TARGETS) {
    if (!allowedIds.has(String(employeeId))) {
      continue;
    }

    try {
      const docs = await findByEmployeeId(employeeId);

      if (docs.length === 0) {
        summary.notFound += 1;
        console.log(`NOT FOUND  ${employeeId}  ${expectedName}`);
        continue;
      }

      if (docs.length > 1) {
        summary.duplicates += 1;
        console.log(`DUPLICATE  ${employeeId}  ${expectedName}  (${docs.length} docs)`);
      }

      for (const snap of docs) {
        const data = snap.data();
        const actualId = String(data.employeeId ?? "");
        if (!allowedIds.has(actualId) && actualId !== String(Number(employeeId))) {
          console.log(`SKIP unexpected ID on doc  expected=${employeeId}  got=${actualId}  doc=${snap.id}`);
          continue;
        }

        const actualName = String(data.name || "");
        const status = data.status || "Active";

        if (!namesLikelyMatch(expectedName, actualName)) {
          summary.nameMismatchSkipped += 1;
          console.log(
            `SKIP NAME MISMATCH  ${employeeId}  expected="${expectedName}"  db="${actualName}"  doc=${snap.id}`
          );
          continue;
        }

        if (status === "deactivated") {
          summary.alreadyDeactivated += 1;
          console.log(`SKIP already deactivated  ${employeeId}  ${actualName}`);
          continue;
        }

        console.log(
          `${APPLY ? "DEACTIVATE" : "WOULD DEACTIVATE"}  ${employeeId}  ${actualName}  doc=${snap.id}  userId=${data.userId || "-"}`
        );

        if (!APPLY) {
          summary.deactivated += 1;
          continue;
        }

        await snap.ref.update({
          status: "deactivated",
          leavingDate: admin.firestore.Timestamp.fromDate(LEAVING_DATE),
          reasonForLeaving: REASON,
          reasonNote: REASON_NOTE,
          deactivatedBy: ACTOR_EMAIL,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        if (data.userId && adminAuth) {
          try {
            await adminAuth.updateUser(data.userId, { disabled: true });
            summary.authDisabled += 1;
          } catch (authErr: any) {
            console.log(`  AUTH FAIL  ${employeeId}  ${authErr.message}`);
          }
        }

        await adminDb.collection("system_logs").add({
          action: "Deactivate Employee",
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          actorEmail: ACTOR_EMAIL,
          actorRole: ACTOR_ROLE,
          targetEmployeeId: snap.id,
          targetEmployeeName: actualName,
          employeeId,
          effectiveDate: LEAVING_DATE.toISOString(),
          reason: REASON,
          note: REASON_NOTE,
        });

        summary.deactivated += 1;
      }
    } catch (err: any) {
      summary.errors += 1;
      console.log(`ERROR  ${employeeId}  ${err.message}`);
    }
  }

  console.log("\n--- SUMMARY ---");
  console.log(summary);
  if (!APPLY) {
    console.log("\nRe-run with --apply to write these changes.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
