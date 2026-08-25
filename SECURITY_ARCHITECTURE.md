# DinRöst – säkerhets- och integritetsarkitektur

## Status
Detta dokument är en säkerhetsdesign för implementation. Ingen verklig BankID-integration eller lagring av känsliga personuppgifter får aktiveras innan BankID-avtal, backendmiljö, rättslig grund, DPIA och extern säkerhetsgranskning är klara.

## Grundprincip
DinRöst ska verifiera att en verklig unik person loggar in, men lagra så lite identifierande information som möjligt. Namn ska inte lagras. Personnummer ska inte lagras i klartext i applikationsdatabasen. Politiska/samhälleliga svar ska hållas tekniskt separerade från autentiseringsuppgifter.

## BankID-flöde
1. Klienten begär inloggning från autentiseringstjänsten.
2. Autentiseringstjänsten initierar BankID.
3. BankID-resultatet valideras server-side. Klienten får aldrig bestämma identitet, ålder eller unikhet.
4. Namn ignoreras och skrivs inte till databas eller applikationslogg.
5. Födelsedata/personnummer används endast i den isolerade autentiseringsprocessen för ålderskontroll och stabil unikhetsmatchning, i den utsträckning BankID-integrationen kräver det.
6. Personen måste vara minst 16 år.
7. En envägs pseudonym skapas med HMAC-SHA-256 över den stabila identifieraren med en separat serverhemlighet/pepper i secrets manager/HSM. Vanlig SHA-hash utan hemlig nyckel är förbjuden.
8. Autentiseringslagret mappar pseudonymen till ett slumpmässigt internt user_id (UUIDv4/UUIDv7 eller 128+ bit kryptografiskt slump-ID).
9. Applikationen får endast user_id och nödvändiga claims, aldrig rå BankID-identitet.
10. Kortlivad, Secure, HttpOnly, SameSite-cookie används för session. Sessions-ID roteras efter autentisering. Ingen identitet i localStorage.

## Ålder
Om födelsedata är tillgängligt via den avtalade BankID-lösningen beräknas 16+-kontrollen server-side. Exakt födelsedatum ska inte lagras om det inte senare visar sig rättsligt och tekniskt nödvändigt. För statistik lagras endast aktuell åldersgrupp. Systemet måste kunna uppdatera åldersgruppen vid framtida verifierade inloggningar.

Förslag på grupper:
- 16–17
- 18–24
- 25–34
- 35–44
- 45–54
- 55–64
- 65+

16–17 ska kunna redovisas separat från röstberättigad ålder.

## Kommun
Kommun är en profiluppgift. Om den avtalade identitetslösningen faktiskt levererar en verifierbar kommun får den importeras som initial kommun och märkas med source=verified_provider. Vi får inte anta att BankID levererar kommun innan detta verifierats i den faktiska integrationen.

Om kommun inte levereras frågar onboarding användaren. Användaren får alltid ändra kommun själv. Efter manuell ändring märks source=self_reported och changed_at sparas. Ingen gatuadress behövs eller lagras.

## Profil
Profilen innehåller endast:
- user_id
- age_band
- municipality_code
- municipality_source
- gender: woman | man | other | prefer_not_to_say
- employment_status: working | studying | job_seeking | sick_leave | parental_leave | retired | other | prefer_not_to_say
- created_at
- profile_updated_at

Sysselsättning och kön är självrapporterade. Kommun kan vara leverantörsverifierad eller självrapporterad. Sjukskriven kan innebära behandling av hälsouppgift och ska därför inte aktiveras förrän rättslig grund/undantag och DPIA uttryckligen täcker detta. Ett säkrare alternativ är kategorin "inte i arbete för närvarande" tills juridiken är klar.

## Dataseparation
### Identity vault
Separat databas/schema och separat behörighet:
- identity_key_hmac
- user_id
- created_at
- last_verified_at

Inget namn. Inget klartext-personnummer. Identity vault får inte vara åtkomligt för statistik- eller frontendtjänster.

### Profile store
- user_id
- demografiska attribut ovan

### Vote eligibility ledger
För varje fråga skapas en separat deterministisk rösttoken, t.ex. HMAC(vote-secret, user_id || question_id). Ledgern lagrar endast question_id + vote_token + timestamp för att förhindra dubbelröstning. Den ska inte innehålla själva svaret.

### Ballot store
Själva svaret lagras separat från eligibility ledger. Ballot store ska inte innehålla user_id eller identity_key_hmac. För analys sparas endast de demografiska dimensioner som är beslutade och nödvändiga för den aktuella statistiken, alternativt aggregeras de vid ingestion. Arkitekturen ska minimera möjligheten att återskapa en persons fullständiga svarshistorik.

### Public aggregates
Publika API:er får endast läsa aggregerade tabeller/vyer. Ingen publik endpoint får kunna fråga råa ballots eller profiler.

## Skydd mot återidentifiering
- Minsta cellstorlek konfigureras och tillämpas server-side, aldrig endast i UI.
- Filterkombinationer som ger för små grupper returnerar suppressed.
- Differencing-attacker ska motverkas: närliggande filter får inte göra det möjligt att räkna fram en liten dold cell genom subtraktion.
- Kommunnivå publiceras bara när tröskeln nås.
- Export av mikrodata är avstängt som standard.
- Professionella statistikprodukter ska i första hand bygga på aggregat.

## API-säkerhet
- TLS endast.
- CSP, HSTS, X-Content-Type-Options, Referrer-Policy och restriktiv Permissions-Policy.
- CSRF-skydd på state-changing requests.
- Strikt schema-/inputvalidering server-side.
- Parameteriserade queries/ORM utan dynamisk SQL.
- Rate limiting per session/IP/risk signal.
- CORS deny-by-default.
- Ingen känslig data i URL/query string.
- Idempotency och transaktion runt röstning så att samma token inte kan rösta två gånger vid race conditions.
- Administratörsgränssnitt separeras från publik app och kräver stark MFA/hårdvarunyckel.

## Loggning
Förbjudet i loggar:
- namn
- personnummer
- rå BankID-payload
- individuella röstsvar tillsammans med user_id
- fullständiga sessionscookies/tokens

Säkerhetsloggar ska använda roterande pseudonymer där möjligt, ha kort retention och strikt åtkomstkontroll.

## Kryptering och hemligheter
- Databaser krypteras at rest.
- Separata nycklar för identity, session och vote-token.
- Nycklar lagras utanför källkod och GitHub, i secrets manager/HSM hos vald driftleverantör.
- Nyckelrotation och incidentprocedur dokumenteras innan produktion.
- Produktionsdata får aldrig kopieras till utvecklingsmiljö.

## Radering och rättigheter
Systemet måste kunna hitta en profil via den verifierade användaren utan att göra ballots direkt identifierbara. Konto-/profilradering och lagringsperioder ska definieras juridiskt innan produktion. Full anonymisering av historiska ballots får endast påstås om återidentifiering faktiskt inte längre är möjlig.

## 16–17-åringar
Ungdomsgruppen ska få tydlig, åldersanpassad information om behandlingen. 16–17 ska kunna analyseras separat. Ingen riktad politisk reklam/profilering ska byggas på deras data. DinRöst ska inte använda individuella politiska svar för annonsering eller individuell påverkan över huvud taget.

## Juridiska produktspärrar före produktion
Före verklig datainsamling krävs minst:
1. Fastställd personuppgiftsansvarig.
2. Dokumenterad rättslig grund enligt GDPR artikel 6.
3. Tillämpligt undantag enligt artikel 9 för behandling som avslöjar politiska åsikter och eventuella hälsouppgifter.
4. DPIA/konsekvensbedömning.
5. Register över behandlingar och retention policy.
6. Personuppgiftsbiträdesavtal med drift-/BankID-leverantörer där relevant.
7. Integritetsinformation som tydligt beskriver BankID-flödet och pseudonymisering.
8. Incidentplan inklusive GDPR:s tidsfrister.
9. Externt penetrationstest och kod-/arkitekturgranskning.
10. Verifiering av exakt vilka attribut den avtalade BankID-lösningen levererar; inga antaganden om kommun eller selektiv attribututlämning.

## Designregel
Frontendprototypen får simulera BankID och onboarding, men får aldrig beskriva mockflödet som verklig BankID-verifiering. Produktion kräver server-side backend; GitHub Pages kan endast vara presentations-/prototyplager och får inte hantera BankID-hemligheter eller känsliga personuppgifter.