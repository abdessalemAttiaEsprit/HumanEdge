import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/useLanguage';
import { LanguageSwitch } from '@/components/LanguageSwitch';

const CONTACT_EMAIL = 'abdessalem123s@gmail.com';

const CONTENT = {
  en: {
    title: 'Privacy Policy',
    updated: 'Last updated: August 2026',
    intro:
      'HumanEdge ("the app", "we") is an HR management platform. This page explains what personal data we collect, why, and how it is used — including when you connect a third-party service such as Google Calendar.',
    sections: [
      {
        heading: '1. Data we collect',
        body: [
          'Account data: name, email address, and role (administrator, company, employee, or candidate).',
          'HR records (for company/employee accounts): phone number, national ID (CIN), social security number, bank account (RIB), employment contract details, salary, absences, tasks, skills, diplomas, and payroll history — entered by you or your employer to operate the HR platform.',
          'Recruitment data (for candidate accounts): CV, cover letters, and job applications you submit.',
          'Messages you exchange with your employer through the built-in messaging feature.',
        ],
      },
      {
        heading: '2. Google Calendar integration',
        body: [
          'If you choose to connect Google Calendar, we request the "https://www.googleapis.com/auth/calendar" scope to create and manage a dedicated secondary calendar named "HumanEdge" in your Google account.',
          'We only ever write to that dedicated calendar — never to your primary calendar or any other calendar you own.',
          'The data we send to Google is limited to what you already store in the app: the title, description, and dates of your absences, assigned tasks, recruitment interviews, and payroll due dates.',
          'You can disconnect Google Calendar at any time from your profile page; we then stop syncing new events (previously created events remain in your Google account until you delete them yourself).',
        ],
      },
      {
        heading: '3. How we use your data',
        body: [
          'To operate the core HR functions of the app: personnel records, contracts, payroll, absence tracking, task assignment, skills management, and recruitment.',
          'To send you transactional emails (e.g. a one-time verification code at login, password reset links).',
          'We do not sell your data, and we do not use it for advertising.',
        ],
      },
      {
        heading: '4. Data sharing',
        body: [
          'Your data is visible to your own employer (if you are an employee) or to the administrators of your own company account — never to other companies using the platform.',
          'We share data with Google only for the Calendar sync described above, and only for accounts that explicitly connect it.',
          'We do not share your data with any other third party.',
        ],
      },
      {
        heading: '5. Data retention and your rights',
        body: [
          'HR and payroll records are retained for as long as your account is active, plus any additional period required by applicable labor law.',
          'You can request access to, correction of, or deletion of your personal data by contacting us at the address below.',
        ],
      },
      {
        heading: '6. Security',
        body: [
          'Passwords are stored hashed, never in plain text. Access to the API is protected by authenticated tokens and role-based permissions, so each account only ever sees the data it is authorized to see.',
        ],
      },
      {
        heading: '7. Contact',
        body: [`Questions about this policy or your data can be sent to ${CONTACT_EMAIL}.`],
      },
    ],
  },
  fr: {
    title: 'Politique de confidentialité',
    updated: 'Dernière mise à jour : août 2026',
    intro:
      "HumanEdge (« l'application », « nous ») est une plateforme de gestion RH. Cette page explique quelles données personnelles nous collectons, pourquoi, et comment elles sont utilisées — y compris lorsque vous connectez un service tiers comme Google Calendar.",
    sections: [
      {
        heading: '1. Données collectées',
        body: [
          'Données de compte : nom, adresse email et rôle (administrateur, entreprise, employé ou candidat).',
          "Dossier RH (comptes entreprise/employé) : téléphone, CIN, numéro CNSS, RIB, détails du contrat de travail, salaire, absences, tâches, compétences, diplômes et historique de paie — saisis par vous ou votre employeur pour faire fonctionner la plateforme RH.",
          'Données de recrutement (comptes candidat) : CV, lettres de motivation et candidatures que vous soumettez.',
          "Messages échangés avec votre employeur via la messagerie intégrée.",
        ],
      },
      {
        heading: '2. Intégration Google Calendar',
        body: [
          'Si vous choisissez de connecter Google Calendar, nous demandons le scope "https://www.googleapis.com/auth/calendar" pour créer et gérer un calendrier secondaire dédié nommé « HumanEdge » dans votre compte Google.',
          "Nous n'écrivons jamais que sur ce calendrier dédié — jamais sur votre calendrier principal ni sur aucun autre calendrier vous appartenant.",
          "Les données envoyées à Google se limitent à ce que vous stockez déjà dans l'application : titre, description et dates de vos absences, tâches assignées, entretiens de recrutement et échéances de paie.",
          "Vous pouvez déconnecter Google Calendar à tout moment depuis votre profil ; nous arrêtons alors de synchroniser de nouveaux événements (les événements déjà créés restent dans votre compte Google jusqu'à ce que vous les supprimiez vous-même).",
        ],
      },
      {
        heading: '3. Usage de vos données',
        body: [
          "Pour faire fonctionner les fonctions RH de l'application : dossiers du personnel, contrats, paie, suivi des absences, attribution de tâches, gestion des compétences et recrutement.",
          'Pour vous envoyer des emails transactionnels (ex : code de vérification à la connexion, lien de réinitialisation de mot de passe).',
          'Nous ne vendons pas vos données et ne les utilisons pas à des fins publicitaires.',
        ],
      },
      {
        heading: '4. Partage des données',
        body: [
          "Vos données sont visibles par votre propre employeur (si vous êtes employé) ou par les administrateurs de votre propre compte entreprise — jamais par d'autres entreprises utilisant la plateforme.",
          "Nous partageons des données avec Google uniquement pour la synchronisation Calendar décrite ci-dessus, et uniquement pour les comptes qui la connectent explicitement.",
          "Nous ne partageons vos données avec aucun autre tiers.",
        ],
      },
      {
        heading: '5. Conservation et vos droits',
        body: [
          "Les données RH et de paie sont conservées tant que votre compte est actif, plus toute durée additionnelle exigée par le droit du travail applicable.",
          "Vous pouvez demander l'accès, la correction ou la suppression de vos données personnelles en nous contactant à l'adresse ci-dessous.",
        ],
      },
      {
        heading: '6. Sécurité',
        body: [
          "Les mots de passe sont stockés hachés, jamais en clair. L'accès à l'API est protégé par des jetons authentifiés et des permissions par rôle, de sorte que chaque compte ne voit que les données qu'il est autorisé à voir.",
        ],
      },
      {
        heading: '7. Contact',
        body: [`Pour toute question sur cette politique ou vos données : ${CONTACT_EMAIL}.`],
      },
    ],
  },
};

export function PrivacyPolicyPage() {
  const { lang, setLang } = useLanguage();
  const content = CONTENT[lang];

  return (
    <div className="landing">
      <header className="public-nav">
        <div className="public-nav__inner">
          <Link to="/" className="public-nav__brand">
            <img src="/assets/logo.png" alt="HumanEdge" />
          </Link>
          <LanguageSwitch lang={lang} onChange={setLang} />
        </div>
      </header>

      <section style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px' }}>
        <h1>{content.title}</h1>
        <p className="field-hint">{content.updated}</p>
        <p style={{ marginTop: 20 }}>{content.intro}</p>

        {content.sections.map((section) => (
          <div key={section.heading} style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: '1.1rem' }}>{section.heading}</h2>
            <ul style={{ marginTop: 10, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {section.body.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <footer className="landing-footer">
        <Link to="/">← {lang === 'fr' ? "Retour à l'accueil" : 'Back to home'}</Link>
      </footer>
    </div>
  );
}
