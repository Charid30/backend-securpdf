'use strict';

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:1700';
const APP_NAME = 'SecurPDFBF';

async function envoyerEmailConfirmation(destinataire, nomFichier) {
  await transporter.sendMail({
    from: `"${APP_NAME}" <${process.env.GMAIL_USER}>`,
    to: destinataire,
    subject: `${APP_NAME} — Récupération de mot de passe en cours`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#111827;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:20px;">
            <span style="color:#22c55e;">Secur</span><span style="color:#fff;">PDF</span><span style="color:#22c55e;">BF</span>
          </h2>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <h3 style="color:#111827;margin-top:0;">Récupération en cours ⏳</h3>
          <p style="color:#4b5563;">Votre demande de récupération du fichier <strong>${nomFichier}</strong> a bien été reçue.</p>
          <p style="color:#4b5563;">Nous testons différentes combinaisons de mots de passe. Cette opération peut prendre <strong>quelques minutes à plusieurs heures</strong> selon la complexité du mot de passe.</p>
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:20px 0;">
            <p style="margin:0;color:#6b7280;font-size:13px;">
              🔍 Tentatives en cours :<br>
              • Mots de passe courants (dictionnaire)<br>
              • Combinaisons numériques (jusqu'à 6 chiffres)<br>
              • Combinaisons alphanumériques courtes
            </p>
          </div>
          <p style="color:#4b5563;">Vous recevrez un autre email dès que le résultat est disponible.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            ${APP_NAME} — Aucun fichier n'est conservé sur nos serveurs au-delà de 24h.
          </p>
        </div>
      </div>
    `,
  });
}

async function envoyerEmailSucces(destinataire, nomFichier, jobId, motDePasseTrouve) {
  const lienTelechargement = `${BASE_URL}/api/bruteforce-word/${jobId}/download`;

  await transporter.sendMail({
    from: `"${APP_NAME}" <${process.env.GMAIL_USER}>`,
    to: destinataire,
    subject: `${APP_NAME} — ✅ Fichier déverrouillé avec succès !`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#111827;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:20px;">
            <span style="color:#22c55e;">Secur</span><span style="color:#fff;">PDF</span><span style="color:#22c55e;">BF</span>
          </h2>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="width:56px;height:56px;background:#dcfce7;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:28px;">✅</div>
          </div>
          <h3 style="color:#111827;margin-top:0;text-align:center;">Mot de passe trouvé !</h3>
          <p style="color:#4b5563;">Le mot de passe du fichier <strong>${nomFichier}</strong> a été retrouvé avec succès.</p>
          ${motDePasseTrouve ? `
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0;text-align:center;">
            <p style="margin:0 0 4px;color:#15803d;font-size:13px;font-weight:600;">Mot de passe trouvé</p>
            <p style="margin:0;color:#166534;font-size:20px;font-weight:700;letter-spacing:2px;">${motDePasseTrouve}</p>
          </div>` : ''}
          <div style="text-align:center;margin:24px 0;">
            <a href="${lienTelechargement}"
               style="background:#22c55e;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;display:inline-block;">
              📥 Télécharger le fichier déverrouillé
            </a>
          </div>
          <p style="color:#ef4444;font-size:13px;text-align:center;">⚠️ Ce lien expire dans 24 heures.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            ${APP_NAME} — Le fichier sera automatiquement supprimé après téléchargement ou dans 24h.
          </p>
        </div>
      </div>
    `,
  });
}

async function envoyerEmailEchec(destinataire, nomFichier) {
  await transporter.sendMail({
    from: `"${APP_NAME}" <${process.env.GMAIL_USER}>`,
    to: destinataire,
    subject: `${APP_NAME} — ❌ Mot de passe introuvable`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#111827;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:20px;">
            <span style="color:#22c55e;">Secur</span><span style="color:#fff;">PDF</span><span style="color:#22c55e;">BF</span>
          </h2>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="width:56px;height:56px;background:#fee2e2;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:28px;">❌</div>
          </div>
          <h3 style="color:#111827;margin-top:0;text-align:center;">Mot de passe introuvable</h3>
          <p style="color:#4b5563;">Nous n'avons pas réussi à retrouver le mot de passe du fichier <strong>${nomFichier}</strong>.</p>
          <div style="background:#fef9f0;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin:20px 0;">
            <p style="margin:0;color:#9a3412;font-size:13px;">
              Cela signifie probablement que le mot de passe est :<br>
              • Long (plus de 6 caractères)<br>
              • Contient des caractères spéciaux (!@#$...)<br>
              • N'est pas un mot de passe courant
            </p>
          </div>
          <p style="color:#4b5563;">Si vous vous souvenez d'indices sur le mot de passe, retournez sur l'application et essayez de le saisir directement.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">
            ${APP_NAME} — Aucun fichier n'est conservé sur nos serveurs.
          </p>
        </div>
      </div>
    `,
  });
}

module.exports = { envoyerEmailConfirmation, envoyerEmailSucces, envoyerEmailEchec };
