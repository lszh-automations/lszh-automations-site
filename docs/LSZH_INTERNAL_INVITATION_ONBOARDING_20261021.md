# Interne Offertenmail und Onboarding-Vorbereitung – 21.10.2026

Neuer Prüfumfang nach abgeschlossener öffentlicher Vorschau: genau eine interne Offertenmail an lars@lszh-automations.ch mit öffentlichem Fragmentlink und zwei fiktiven PDF-Anhängen. Kein erneuter Annahmetest, kein V3-Reset, kein realer Kunde oder Auftrag, keine produktive Onboarding-Einreichung.

## Fester Versandpfad

scripts/public-test-invitation.mjs baut einen unveränderlichen MIME-Umschlag: From/To ausschliesslich Geschäftskonto, kein CC/BCC, TEST_ONLY-Betreff, klare Kennzeichnung Kein Vertrag/keine Rechnung/keine Annahme, fiktive Offerte und TEST-Bedingungen aus dem bisherigen Fixturegenerator. Link nur im Mailinhalt und Browserfragment, keine Chat-/Dateiausgabe. Ein separater HMAC-Kontext erzeugt einen neuen Code, der frühere Browser-Testlink wird dadurch nicht reaktiviert. Zugriff 30 Minuten; Mailmodus verlangt mindestens fünf Minuten Restlaufzeit.

Vor Gmail native Firestore-Create-Reservierung in lszh-offers-staging/lszh_public_preview_mail_attempts/LSZH_PUBLIC_PREVIEW_INVITATION_20261021_NO_CONTRACT. Vorhandener Versuch HTTP 409 stoppt vor Gmail. Reservierung bleibt auch nach Timeout/unklarem Ausgang bestehen. Bestätigte Gmail-ID und Versandzeit werden danach gespeichert. Kein automatischer Replay, kein Exactly-once-Provider-Versprechen. Keine Kunden-/Offerten-/Auftragsdaten angelegt, nur dedizierter interner Versuchsnachweis. Bestehende Make-Szenarien unverändert.

Für den neuen Mail→Link-Teiltest wird das bereits geprüfte Image aus Build 5eaba22f-c168-420a-ac0e-acfd0e5bbf2b mit unverändertem Digest kurzzeitig wiederverwendet. Keine neue Build-/PDF-/V3-Testwiederholung. Neuer Zweck ist die tatsächliche Zustellung und Nutzung des Links aus der Mail. Genau der bisherige separate Vorschaudienst, gleicher enger Ressourcenrahmen und Rückbau nach Betreiberbestätigung. Keine Annahme oder Kunden-Onboarding-Route im Dienst.

## Onboarding-Codevorbereitung, nicht veröffentlicht

Vorhandene Onboarding-Webseite kann nun Code/Firma/Projekt aus Fragment übernehmen und entfernt Query/Fragment sofort aus Browserhistorie. Alte eindeutige Querylinks bleiben nutzbar, doppelte/konkurrierende Codes werden nicht automatisch ausgewählt. no-referrer/noindex-Metadaten ergänzt. Aktuelle Make-Linkausgabe und produktiver Webauftritt wurden nicht geändert oder bereitgestellt.

Echter Chromium-Test gegen ausschliesslich lokalen künstlichen HTTP-Backend: tatsächliches Formular mit fiktiven Daten ausgefüllt, ein POST, Code korrekt, Antwort HTTP 202 ausdrücklich als noch nicht bestätigte Speicherung angezeigt. Kein Kontakt zu Make/CRM und keine reale Einreichung. Bereits vorhandene Erfolgs-/Duplikat-UI-Tests erhalten. Das ist keine Live-Kunden-Onboarding-Abnahme.

## Lokale Prüfung

314 Node-Tests: 308 bestanden, 6 übersprungen, 0 Fehler. Drei neue Versandfälle: ein Provideraufruf nach Reservierung, keine Wiederholung nach unklarem Ergebnis, abgelaufener/zu kurz gültiger Link stoppt vor Reservierung. Zwei Onboarding-Fragmentfälle und ein neuer Chromium-Onboardingtest bestanden. Operator-Syntax geprüft. Live-Mail noch nicht aus den Offline-Ergebnissen ableiten.
