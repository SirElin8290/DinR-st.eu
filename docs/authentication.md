# DinRöst: konto, verifiering och inloggning

## Levererad kedja

1. Formuläret skickas endast från kontotjänstens eget HTTPS-ursprung.
2. Servern kontrollerar namn, e-post, personnummerformat, datum, kontrollsiffra, 16-årsgräns och kommun mot SCB.
3. Hela personnumret sparas inte. En separat HMAC används för unikhet av det **angivna** numret. Detta är inte verifierad personunikhet.
4. En ännu obekräftad registrering lagras kortvarigt och krypterat; den reserverar inte en persons nummer eller skapar ett konto.
5. En engångslänk skickas via en separat krypterad utskickskö. Adress och länktoken sparas inte i klartext i databasen.
6. Mejllänken har token i URL-fragmentet, inte i en serverloggad queryparameter. Bekräftelsesidan tar omedelbart bort fragmentet ur adressfältet.
7. Ett GET-anrop eller en mejlskanner loggar inte in. Besökaren måste trycka på en bekräftelseknapp. Länken fungerar i 20 minuter, en gång, och i webbläsaren där den begärdes.
8. En atomisk bekräftelse skapar kontot, markerar e-postadressen som bekräftad och utfärdar en slumpmässig session. Två samtidiga försök ger högst en session.
9. Återkommande inloggning använder en ny engångslänk. Inget lösenord behöver återställas eller lagras.
10. Sessionscookien är Secure, HttpOnly, SameSite=Lax, hostbunden och giltig i högst tolv timmar. Endast dess SHA-256-hash ligger i databasen.
11. Utloggning spärrar den aktuella sessionen. Utloggning på alla enheter spärrar alla sessioner och redan utfärdade, oanvända inloggningslänkar.

## Driftresurser

- Konto-Worker och webbplats: `https://dinrost-api.soren-johansson-7.workers.dev`
- Kontodatabas: `dinrost-auth-prod`, D1-ID `99300475-9426-4ac3-bbe0-6333c842669b`.
- Separat opinionsdatabas: `dinrost-research-prod`, D1-ID `ea9b4976-5b83-4db0-bb27-fcccda4239b7`.
- Båda är skapade med D1-jurisdiktion `eu`. Det är en lagringsinställning för D1, inte ett påstående om EU-begränsning för all nätverks-, Worker-, logg- eller e-postbehandling.
- Scheman har versionsspårade migrationskataloger `worker/auth-migrations` och `worker/migrations`.
- Webbplatsfiler byggs från en uttrycklig tillåten lista. `.public/` är inte källkod eller databasexport och ligger inte i Git.

GitHub Pages kör inte backend och ska inte hantera inloggning genom tredjepartscookies. När flödet öppnas leder GitHub-versionens knappar till samma webbplats hos konto-Workern, där cookie och API delar ursprung. Inga ifyllda kontouppgifter överförs i den omdirigeringen. En framtida domänkoppling kan ge allt samma huvuddomän.

## Nycklar och dataseparation

Följande oberoende 256-bitarshemligheter finns endast som Worker secrets:

- `DATA_ENCRYPTION_KEY`: AES-256-GCM för kontoprofil och kortvariga utskick. Varje kryptering har ny slump-IV och ändamålsbundet AAD. Fel konto-ID eller ändrad ciphertext gör posten oläsbar.
- `EMAIL_HMAC_KEY`: e-postuppslagning.
- `SUBJECT_HMAC_KEY`: unikhetskontroll för angivet personnummer.
- `CSRF_HMAC_KEY`: sessionsbundet skydd för skrivande anrop.
- `RATE_HMAC_KEY`: nycklad kod av risk-/försöksnycklar; ingen rå IP-adress lagras i dessa tabeller.

Generera **inte om** dessa nycklar vid vanlig driftsättning. Förlust eller ogenomtänkt rotation av krypterings-/uppslagsnycklar kan göra konton oåtkomliga. Återställning och kontrollerad nyckelrotation behöver ett separat förfarande och en skyddad backupstrategi.

Krypterad kontoprofil innehåller förnamn, efternamn, e-post, födelsetid och juridiskt kön enligt det självrapporterade personnumret samt hemkommun. Exakt födelsetid ligger inte i opinionssvar eller publika exporter. Ålder räknas om på servern när kontot används. Folkbokföringsort och identitet är fortfarande självrapporterade.

Kontoregistrering är inte samtycke till analys av politiska åsikter. Endast ett separat uttryckligt deltagandeflöde får skapa `research_participants`. Endpointen `/api/research/consent` finns för ett granskat framtida flöde men är stängd tillsammans med opinionsinsamlingen. Registrering skriver aldrig automatiskt svar eller forskningssamtycke.

## E-postanslutning som återstår

En skickadapter för Resend är implementerad. Det går att lägga till en annan leverantör bakom samma utskicksfunktion. Det krävs mer än en vanlig inkorg: en avsändaradress, verifierad avsändardomän och behörighet hos en tjänst som skickar transaktionsmejl.

När avsändaren är klar:

1. Ange avsändaradress och e-posttjänst. För Resend: verifiera domänen och ställ in dess SPF/DKIM enligt tjänstens anvisningar. Beakta DMARC och stäng av länk-/öppningsspårning för autentiseringsmejl.
2. Lägg API-nyckeln i `RESEND_API_KEY` med hemlighetshanteraren, aldrig i GitHub, en publik sida eller ett vanligt konfigurationsfält.
3. Ange `MAIL_FROM` och välj `MAIL_PROVIDER="resend"` först när leverantören faktiskt är ansluten.
4. Färdigställ `privacy.html` och fastställ personuppgiftsansvarig, kontakt, rättslig grund, personuppgiftsbiträden/överföringar, lagringstider och rättighetsrutiner. Utvärdera skydd för minderåriga och uppgiftsmissbruk samt gör den tidigare dokumenterade säkerhets-/dataskyddsgranskningen.
5. Sätt en färdig informationsversion som `account-v1` och `PRIVACY_REVIEWED="true"`. En draft-version kan inte öppna tjänsten.
6. Testa verklig leverans till ägarens testadress, inklusive skräppost, förseningar, återförsök, länkskanning, mobilens mejlapp och öppning i fel webbläsare. Inga verkliga mejl har skickats i den här leveransen.
7. Först därefter öppnas `AUTH_ENABLED` och `REGISTRATION_ENABLED` genom en kontrollerad driftsättning. Opinionsinsamling har en oberoende spärr och öppnas inte med dessa inställningar.

API-nycklar ska inte klistras in i chatten. De ska föras in som hemliga inställningar i tjänsten. Nuvarande utskicks-, registrerings- och insamlingsflaggor är avstängda.

## Kö, spärrar och gallring

- Anonym begäran ger samma status, meddelande och cookietyp för känd/okänd e-post. Detta minskar kontoenumerering men är inte ett formellt bevis mot tidsanalys.
- Försöksgränser: 30 per IP-kod och fem per e-postkod under ett 15-minutersfönster. Fler kontroller/botskydd kan behövas vid verklig trafik; en nycklad IP-kod gör inte riskuppgiften säkert anonym.
- JSON läses med en gräns på 8 KiB. Origin, innehållstyp och sessionsbundet CSRF-token kontrolleras server-side.
- Ny länk återkallar tidigare länk för samma e-post och ändamål.
- Utskick har atomiskt leveranslås, högst tre försök, tidsgräns och samma idempotensnyckel vid återförsök. Ett leveransfel ger inget fungerande konto och lämnar inte ut en token i API-svaret.
- Utskickens krypterade adress och länk rensas efter leverans, förbrukning, återkallande eller utgång.
- Ett jobb var tionde minut rensar utgångna sessioner, uppgifter i utgångna registreringar, gamla försöksposter och säkerhetshändelser äldre än 30 dagar. Utgångna flödesrader tas bort efter ett dygn. Krypterad pendingprofil kan därför finnas kvar upp till cirka 30 minuter efter begäran, även om själva länken slutar fungera efter 20 minuter.
- Verifierade konton gallras inte automatiskt. Slutlig kontoretention och konto-/personuppgiftsradering, registerutdrag, felaktig personnummeruppgift, förlorad e-poståtkomst och hantering av backuper måste fastställas före öppning. Utloggning är inte kontoradering.
- Ingen offentlig debug-/brevlåde-/tokenendpoint finns. Testtransporten är programmatisk och vägrar användas i produktionsmiljö.

## Endpoints

| Endpoint | Funktion |
|---|---|
| GET `/api/auth/status` | Offentlig, personuppgiftsfri beredskap och informationsversion |
| POST `/api/auth/register` | Validering och e-postbekräftelse; skapar inget konto direkt |
| POST `/api/auth/request-link` | Begär ny engångslänk för inloggning |
| POST `/api/auth/complete` | Förbrukar en giltig browserbunden länk atomiskt |
| GET `/api/auth/me` | Privat kontovy och CSRF-token, med no-store |
| POST `/api/auth/logout` | Spärrar aktuell session |
| POST `/api/auth/logout-all` | Spärrar alla sessioner och väntande länkar |
| POST `/api/research/consent` | Separat, avstängd forsknings-/deltagandekoppling |

## Verifieringsgräns

Automatiska tester använder syntetiska uppgifter, SQLite/D1-adapter och en intern testtransport som inte skickar mejl. De provar bland annat samtidiga tokenförsök, replay, annan webbläsare, kryptering, utgångna länkar, utloggning på alla enheter, leveransfel, dubbletter, avsändarspärr, ursprung och försöksspärrar. Scheman migreras och status kontrolleras separat mot verklig Cloudflare D1. Det ersätter inte extern säkerhetsgranskning eller en verklig verifierad e-postleverans.

Officiella driftsreferenser:

- Cloudflare D1-jurisdiktion: https://developers.cloudflare.com/d1/configuration/data-location/
- Workers med statiska filer: https://developers.cloudflare.com/workers/static-assets/binding/
- Resend och idempotensnycklar: https://www.resend.com/blog/engineering-idempotency-keys
