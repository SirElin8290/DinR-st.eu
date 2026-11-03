# DinRöst: opinionsarkiv och dataskydd

## Verifierad utgångspunkt 2026-11-03

Granskad GitHub-bas: `SirElin8290/DinR-st.eu`, commit `383264e`.
Frontend var en lokal prototyp med sex frågor och simulerade resultat. Worker var ett scaffold med mock-inloggning, sex seedfrågor och konfigurationsplatshållare för D1.
I det anslutna Cloudflare-kontot fanns vid kontrollen ingen D1 med namnet `dinrost-prod`, ingen Worker `dinrost-api` och inga listade Pages-projekt. Det utesluter inte andra konton eller andra tjänstenamn. Ingen produktionsdatabas lästes eller ändrades.

## Implementerat lokalt

- Additiv SQL-migration: historiska tabeller skrivs inte över eller importeras automatiskt.
- Oföränderliga metod- och frågeversioner med versionerade svarsalternativ, ordning, kontext och jämförelsefingeravtryck.
- Exakt åtta godkända frågor i åtta kategorier före öppning; redaktionella beslut med granskare och tidsstämpel. Beställare kan anges, men kan inte själv godkänna publicering.
- Veckor i Europe/Stockholm: måndag 00.00 inklusive till nästa måndag 00.00 exklusive. Söndag 23.59.59 är sista hela sekunden. UTC-gränser hanterar veckor om 167 och 169 timmar vid tidsomställning.
- Separata deltagaruppgifter, deltagandekvitton, svar och slumpmässiga raderingsnycklar. Atomisk transaktion och unik databasnyckel för ett svar per konto och veckofråga.
- Ögonblicksbild av demografi, geografisk källa, verifieringsnivå, rekryteringskanal och samtyckesversion. Inga namn, e-postadresser, personnummer, IP-adresser eller kontonycklar i svarstabellen.
- Exakta tider för versioner, samtycke, granskning och publicering. Svar behåller endast insamlingsvecka för att minska tidskorrelation. Detta begränsar analyser inom veckan avsiktligt.
- Frysta, kontrollsummerade resultat, en publicering per vecka. Rättelser och återkallanden är separata, oföränderliga notiser. Historik skrivs inte över.
- Öppet resultat-API utan inloggning. Kontrollpanel under kategorierna: sökning, kategorival, gamla veckor, två frågor bredvid varandra, ålder, kön, kommun, region, metoduppgifter och JSON-export av visad jämförelse.
- Kontrollpanelen använder samma publicerade underlag som API:t. Ingen webbaserad mikrodataexport.
- Insamling och mock-inloggning är avstängda i produktionskonfigurationen. Äldre liveaggregat och röstmottagning är spärrade i produktion.

## Sekretessmodell och dess kostnad

Aktuell publiceringspolicy är `fixed-municipality-cube-v2`: en enda fryst partition per fråga av åldersgrupp × profilkön × kommun. Varje svarsalternativ i varje förekommande demografisk grupp i kommunen måste ha minst 50 svar. Om ett alternativ eller en grupp inte klarar gränsen hålls hela kommunen inne. Övriga kommuner kan publiceras.

Alla tillåtna kommun-, region- och riksvyer summerar exakt samma publicerade disjunkta celler. Inga separata rikstotaler eller regiontotaler som inkluderar dolda kommuner publiceras. Därmed kan en dold kommuns svar inte räknas fram genom subtraktion från en sådan total. Panel och export märker att täckningen är begränsad till publicerade kommungrupper; resultatet får inte beskrivas som alla deltagare i regionen eller landet. Inget antal svar eller demografiska celler lämnas för dolda kommuner. Ingen liveuppdatering, alternativ partition, exklusionsfiltrering eller mikrodataexport erbjuds.

Den ursprungliga policyn `fixed-cube-v1` behålls för läsning av äldre regionuttag. De skrivs inte om eller ges kommunuppgifter i efterhand. Högst en publicering tillåts per vecka även efter policybyte. En separat jämförelsevarning visas när frågeversion, metod, policy, geografiversion eller mängden publicerade kommuner skiljer sig.

Kommun- och länskoder valideras mot SCB:s versionsspårade förteckning för 2026: 290 kommuner och 21 län. Regionen härleds från giltig kommunkod på servern, inte från klientens uppgift. Förteckningens källa, hämtningstid och kontrollsumma finns i `worker/src/geography.js`. Svar får `geography_version=scb-2026`. Migration 0002 ger inte äldre svar en förment verifierad geografiversion: sådana uppgifter kräver uttrycklig granskning innan de kan ingå i ett v2-uttag. Källan till bostadsuppgiften förblir självrapporterad om den inte faktiskt har verifierats.

Tröskeln kan hålla inne stora delar av underlaget och måste utvärderas med statistiker innan riktiga resultat publiceras. Lösningen utgör inte differential privacy eller bevisad anonymitet; bakgrundskunskap och upprepade uttag över år kan fortfarande skapa risk. Inga riktiga svar finns i den nu publicerade förhandsversionen.

Svar är pseudonymiserade, inte säkert anonyma. En person som får en svarsspecifik raderingsnyckel kan koppla den till sitt svar. Plattformen sparar endast nyckelns hash, och ingen nyckel som binder samma persons samtliga svar. Kontots kvitton anger att deltagande skett men inte svaret.

## Forsknings- och journalistikvillkor

Urvalet är självrekryterat. Rekrytering via politiska grupper, DinPuls, universitet och evenemang kan ge olika snedvridningar. Metadata beskriver detta; viktning, konventionella felmarginaler och representativitet fabriceras inte. Antal inbjudna och exponerade är okända. Svarsfrekvens kan därför inte redovisas. Avstått från att svara är inte samma sak som nej eller vet inte.

Jämförelsefingeravtrycket omfattar ordalydelse, kontext, svarsalternativens text och ordning samt oföränderligt metod-ID. Ändring kräver ny version och bryter jämförbarheten. Samma fingeravtryck innebär teknisk jämförbarhet, inte att deltagarsammansättningen är densamma. Ingen individuell longitudinell panel byggs.

Det finns en kvalitetsmarkering `accepted|quarantined`; endast accepted används. Mockdata spärrar publicering. Automatisk bottidentifiering, personunikhet, externa befolkningsvikter är inte implementerade. Kommunmappning mot SCB är implementerad, men verifiering av en persons faktiska bostadsort återstår. Identitetsverifiering får bara sättas av en framtida betrodd adapter efter faktiskt verifieringsutfall, aldrig av klienten. E-postverifiering styrker kontroll över e-post, inte person eller bostadsort. Personnummer anger inte aktuell kommun eller region.

De åtta första frågorna är redaktionella **utkast**, inte färdiggranskade frågor eller påståenden om dagens lagstiftning. De finns i `data/research-catalog.json`. Produktionsveckor förbereds med ett uttryckligt datum; inga frågor öppnas eller publiceras automatiskt från frontend.

## Variabler och API

`research_versions`: question_id, version, wording, context, options_json, comparison_key, created_at.
`research_waves`: id (lokalt måndagsdatum), opens_at/closes_at (ISO UTC), timezone, method_id, status.
`research_items`: veckans förekomst och position, version_id, category, sponsor, editorial_review.
`research_participants`: kontonyckel, verifiering, grov ålder, profilkön, kommun/region, geografisk källa, rekryteringskanal, samtycke/återkallande. Enbart betrodd administration får provisionera.
`research_answers`: slump-ID, item_id, option_id, received_week, demografisk/geografisk ögonblicksbild, verifiering, rekrytering, samtyckesversion, kvalitetsmarkering.
`research_releases`: fryst JSON, granskar-ID, policyversion, SHA-256. SHA-256 styrker konsistens, inte utgivarens identitet; transport och publiceringsbehörighet måste skyddas separat.

- GET `/api/research/archive`: publiceringsförteckning, nyaste vecka först. Återkallade uttag utelämnas.
- GET `/api/research/releases/{id}`: fryst JSON och checksumma samt separata rättelsenotiser. Återkallat uttag ger 410.
- GET `/api/research/questions`: högst 416 öppnade/godkända frågeförekomster, senaste först. Full publicerad historik finns via archive/release.
- POST `/api/research/items/{id}/answers`: endast `{option_id}` från giltig session, tillåtet origin och uttryckligen aktiverad insamling. Betrodda deltagarclaims och samtycke krävs.
- POST `/api/research/erase`: `{removal_key}` med giltig session; fungerar även när insamlingen stoppats. Kvitto behålls för att förhindra omröstning. Inget individuellt svar återlämnas.
- POST `/api/research/withdraw`: stoppar fortsatt deltagande. Tidigare svar raderas separat med raderingsnycklar.

Svarskoder och data är maskinläsbara. JSON-export innehåller metod, nämnare, oviktade antal/andelar, version, sekretesspolicy, mätperiod och källans checksumma. Export av jämförelse i panelen är en härledd vy; källans checksumma avser hela ursprungspubliceringen.

## Drift och lokala verktyg

Node 24 krävs för de lokala SQLite-verktygen och testerna. Inga nya npm-beroenden krävs för dessa.

```text
cd worker
npm test
node scripts/research.mjs init LOCAL.sqlite
node scripts/research.mjs draft LOCAL.sqlite 2026-11-09T12:00:00Z
node scripts/research.mjs review LOCAL.sqlite 2026-11-09-1 approved GRANSKARE
# Granska samtliga åtta frågor individuellt före nästa steg.
node scripts/research.mjs open LOCAL.sqlite 2026-11-09
# Öppnad vecka tar endast emot svar inom sitt datumintervall.
# Efter sluttiden:
node scripts/research.mjs close LOCAL.sqlite 2026-11-09
node scripts/research.mjs release LOCAL.sqlite 2026-11-09 GRANSKARE release.json
node scripts/research.mjs notice LOCAL.sqlite release-2026-11-09 correction GRANSKARE "Förklarande rättelsetext"
node scripts/research.mjs notice LOCAL.sqlite release-2026-11-09 withdrawal GRANSKARE "Skäl till återkallande"
```

Verktygen arbetar endast med den angivna lokala filen. Ingen automatisk uppladdning till D1 eller publicering görs. Kör init en gång per ny databas; migrationen ska versionsspåras av driftens migreringsprocess. Historisk legacydata kräver separat inventering och dokumenterat beslut; inga äldre verifieringsnivåer får uppgraderas genom antaganden.

Panelen använder samma ursprung för API:t som standard. Vid separat API anges ett meta-element med `name="research-api"` och API:ts ursprung i content. CORS måste då använda frontendens normaliserade HTTPS-origin. Lägg API under samma webbplats för fungerande sessionscookies. GitHub Pages kör inte Workers.

## Krävs före riktig insamling eller publicering av verkliga opinionsresultat

1. Bekräfta rätt Cloudflare-konto, domän/Worker-routes, D1-bindning och separat utvecklingsmiljö. Gör backup, lokalt migreringstest, stagingtest på verklig D1 och återställningsövning. Den nuvarande D1-konfigurationen innehåller en platshållare.
2. Bygg och testa verklig registrering, e-postverifiering, sessionshantering, serverkontrollerad åldersgräns och betrodd provisionering av research_participants. Koppla frontendens svar och raderingsnycklar till detta flöde. Prototypens BankID-knapp räcker inte.
3. Underhåll den implementerade versionsspårade SCB-tabellen och valideringen av hemkommun. Importera inte personnummer till forskningsdatabasen. Välj om kön är självrapporterat eller juridiskt härlett; blanda inte källor under en omärkt variabel.
4. Fastställ personuppgiftsansvarig, ändamål, artikel 6-grund och artikel 9-undantag där uppgifterna avslöjar politiska åsikter. Färdigställ DPIA, biträdesavtal/överföringsbedömning, integritetsinformation, särskild bedömning för 16–17-åringar och samtyckestext där samtycke används.
5. Besluta faktiska lagringstider för profiler, kvitton, svar, raderingsnycklar, säkerhetsloggar och backuper. Automatiserad gallring är inte implementerad. Ett evigt opinionsarkiv motiverar inte evig lagring av personuppgifter. Radera innan gallringsfrister löper ut och dokumentera det.
6. Genomför rättighetsprocess för registerutdrag, rättelse, radering och återkallat samtycke, inklusive borttappade raderingsnycklar och historiska backuper. API-radering är en komponent, inte en fullständig GDPR-process. Tidigare nedladdade sammanställningar kan inte återkallas tekniskt. Bedöm om de är tillräckligt anonyma för fortsatt bevarande.
7. Separera behörigheter för identitet, svar, administration och publika aggregat i drift. Nu finns logisk tabellseparation i samma D1, inte skilda databaser eller nycklar. Publik Worker har tekniskt DB-bindning med bred åtkomst; en separat lästjänst/aggregatdatabas återstår.
8. Inför API-rate limiting, bot-/missbruksskydd, MFA för administratörer, loggminimering och incidentrutiner. Inget publikt skrivande admin-API finns; lokala verktyg förutsätter en betrodd operatör.
9. Låt statistiker granska småcellspolicy och jämförbarhet samt redaktör granska alla åtta frågor och eventuell beställare. Ny beräkningsmetod eller omräkning får inte kringgå en-publicering-per-vecka-regeln; gör sekretessprövning och versionerad rättelseplan först.
10. Extern säkerhetsgranskning och verkliga användarflöden på mobil/dator. Inga produktionsflöden är verifierade av de lokala testerna. En framtida användning av känsliga personuppgifter i forskning kan kräva etikgodkännande av forskningshuvudmannen; att data finns i ett arkiv är inget generellt tillstånd.

## Källor kontrollerade 2026-11-03

- IMY, känsliga personuppgifter: https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/introduktion-till-gdpr/personuppgifter/kansliga-personuppgifter/
- IMY, när känsliga uppgifter får behandlas: https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/introduktion-till-gdpr/personuppgifter/kansliga-personuppgifter/nar-far-ni-behandla-kansliga-personuppgifter/
- IMY, praktisk guide till konsekvensbedömning: https://www.imy.se/globalassets/dokument/vagledningar/en-praktisk-guide.pdf
- Etikprövningsmyndigheten, personuppgifter: https://etikprovningsmyndigheten.se/personuppgifter/

Detta är teknisk dokumentation och en införandeplan, inte ett juridiskt godkännande.

## GitHub Pages-publicering med kommunstatistik, 2026-11-03

Webbplatsen kan publiceras som en öppen, statisk förhandsversion på det befintliga GitHub Pages-projektet, med insamling stängd. Startsidan leder direkt till kontrollpanelen utan simulerad BankID-inloggning. Alla 290 kommuner går att välja även när inga resultat publicerats. Frånvaro av publicerade resultat får inte visas som noll röster.

Panelen använder research-API:t när det finns och faller annars tillbaka till ett fryst JSON-arkiv under `data/research-releases/`. Indexet är initialt tomt. Dessa statiska JSON-filer fungerar som ett öppet, läsbart data-API på GitHub Pages. Ingen Worker eller persondatabas skapas genom denna publicering.

Efter att riktiga insamlings- och publiceringskontroller är uppfyllda kan en granskad lokal databas exporteras med:

```text
node scripts/export-public.mjs LOCAL.sqlite ../data/research-releases
```

Exportören kontrollerar policy, geografiversion, kontrollsummor och småcellsgränser före filskrivning. Den exporterar endast frysta aggregerade publiceringar och rättelsenotiser. Återkallanden tar bort uttaget ur index och ersätter dess statiska fil med en återkallandenotis. Kopior och historiska Git-objekt hos andra kan inte dras tillbaka; därför måste exportens anonymitets- och publiceringsprövning vara klar före första uppladdningen. Konton, deltagandekvitton och individuella svar exporteras aldrig.

Officiell geografikälla: https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/lan-och-kommuner/lan-och-kommuner-i-kodnummerordning/

## Startsida och kategorimoduler, 2026-11-03

Startsidan har en samlad registrerings- och inloggningsvy. Registreringen visar förnamn, efternamn, personnummer (tolv siffror), hemkommun från SCB-listan och e-post. Den kontrollerar format, kalenderdatum, Luhn-kontrollsiffra och 16-årsgräns samt visar ålder och juridiskt kön enligt personnumret. Samordningsnummer stöds ännu inte. Kontrollen bevisar inte att personen äger identiteten. Den kan heller inte säkerställa folkbokföringsort. Källhänvisning: https://www.skatteverket.se/privat/folkbokforing/personnummer.html

Vyn är fortfarande en förhandsversion: knapparna ger lokal återkoppling men skapar inget konto och skickar ingen e-post. Inga personuppgifter skrivs till localStorage, sessionStorage, cookies, URL:er eller server från dessa formulär. Formulären hindrar vanlig webbläsarinskickning även om modulen inte kan laddas, och knapparna är initialt inaktiverade. En riktig servermottagare måste återvalidera allt; klientens ålders- eller könsuppgift får aldrig bli verifieringsbevis.

Den planerade inloggningen använder tidsbegränsad e-postlänk. Leverantör, tokenhantering, missbruksskydd och samtyckes-/informationsflöde behöver kopplas in och testas före aktivering.

Färgidentiteterna i `categories.js` används gemensamt av startsidans kategorilänkar, frågemoduler och resultatsektioner. Kategori anges alltid med text och inte enbart färg. Åtta separata textfärger på ljusa bakgrunder är kontrasttestade till minst 4,5:1. Inga nya bildresurser har skapats.

## Flipkort för konto, 2026-11-03

Kontovyn använder samma princip som DinPuls: registrering på framsidan och inloggning på baksidan av ett gemensamt kort. Logga in roterar kortet -180 grader runt Y-axeln (höger till vänster); Skapa konto vänder tillbaka. Höjden följer den aktiva sidans innehåll och anpassas även vid omflöde och felmeddelanden.

Den inaktiva sidan är inert och aria-hidden så att dess fält inte nås med tangentbord eller skärmläsare. Fokus flyttas till den aktiva sidans växlingsknapp efter vändningen. Reducerad rörelse ger ett direkt sidbyte utan rotation. Befintliga fältvärden bevaras vid vändning, medan den tidigare rensningen vid navigering fortfarande gäller. Vanligt besök på startsidan visar registreringen; direktlänken med mode=login visar baksidan. Inget insamlings- eller inloggningssystem aktiveras av animationen.
