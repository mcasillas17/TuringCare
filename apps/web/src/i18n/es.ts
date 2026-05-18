import type { Messages } from "./types";

/** Widened version of Messages that accepts any string values while still enforcing key parity. */
type Catalog = { [S in keyof Messages]: { [K in keyof Messages[S]]: string } };

export const es = {
  language: { label: "Idioma", en: "EN", es: "ES" },
  nav: {
    howItWorks: "Cómo funciona",
    brief: "Resumen de conducta",
    trainers: "Adiestradores",
    faq: "Preguntas",
    login: "Iniciar sesión",
    getStarted: "Empezar",
  },
  hero: {
    eyebrow: "Refuerzo positivo · Con base científica",
    headline: "Entiende a tu perro.",
    headlineEmphasis: "Adiéstralo con refuerzo positivo.",
    subcopy:
      "TuringCare ayuda a dueños de cachorros y nuevos adoptantes a llevar un diario de conducta estructurado — y lo convierte en un Resumen de conducta compartible que tu adiestrador/a de refuerzo positivo puede usar de inmediato.",
    turingCaption:
      "Creado por gente de perros, y bautizado en honor a Turing, un Mini American Shepherd azul mirlo.",
  },
  howItWorks: {
    title: "Del caos a un plan en tres pasos",
    subtitle:
      "Sin tecnicismos, sin collares de castigo. Solo observación estructurada que hace el adiestramiento medible.",
    step1Title: "Crea el perfil de tu perro",
    step1Body:
      "Raza, edad, historial, preocupaciones y objetivos — el contexto que todo adiestrador/a necesita, en un solo lugar.",
    step2Title: "Registra conductas con el diario ABC",
    step2Body:
      "Captura Antecedente → Conducta → Consecuencia con intensidad y contexto. Los patrones emergen rápido.",
    step3Title: "Genera un Resumen de conducta",
    step3Body:
      "Con un toque, tu diario se convierte en un resumen claro y compartible con el que tu adiestrador/a basado en recompensas puede actuar.",
  },
  briefSpotlight: {
    title: "El Resumen de conducta",
    body: "Tu artefacto clave. Todo lo que has registrado, destilado en un resumen tranquilo y profesional con el que un adiestrador/a basado en recompensas puede actuar de inmediato.",
    benefit1: "Entradas ABC estructuradas, no notas vagas",
    benefit2: "Gravedad y tendencias que el adiestrador/a puede leer en segundos",
    benefit3: "PDF exportable — comparte antes de la primera sesión",
    benefit4: "Mantiene al dueño y al adiestrador/a alineados en el plan",
    cardKicker: "Resumen de conducta",
    cardDog: "Maple · Aussie · 1 año",
    cardDraft: "Borrador",
    cardRow1: "Reactividad con correa",
    cardRow1Sev: "Moderada",
    cardRow2: "Angustia por separación",
    cardRow2Sev: "Leve",
    cardAbc:
      'A · "Suena el timbre" → B · "Ladra, se lanza 8s" → C · "El dueño redirige con dispersión de comida"',
  },
  philosophy: {
    title: "El refuerzo positivo no es una función. Es la idea central.",
    subcopy:
      "TuringCare existe porque los perros aprenden mejor — y viven mejor — sin miedo. El producto está construido en torno a los métodos que la ciencia realmente respalda.",
    p1h: "La conducta es información",
    p1p: "Cada reacción te dice lo que tu perro necesita — te ayudamos a interpretarla.",
    p2h: "Refuerza, no intimides",
    p2p: "Sin collares de púas, descarga eléctrica ni miedo. Métodos respaldados por la ciencia del comportamiento.",
    p3h: "Mide y luego ajusta",
    p3p: "Los registros estructurados convierten las suposiciones en un plan que puedes evaluar.",
    p4h: "Dueño y adiestrador/a, alineados",
    p4p: "Una fuente de verdad compartida para que todos trabajen en la misma dirección.",
  },
  trainers: {
    badge: "Próximamente",
    title: "Encuentra un adiestrador/a de refuerzo positivo que se adapte a ti",
    subcopy:
      "Un directorio curado de adiestradores/as con base científica — filtrable por metodología, certificación y especialidad — está en camino. Tu Resumen de conducta se integrará directamente.",
    tag1: "Basado en recompensas",
    tag2: "Certificado Fear-Free",
    tag3: "Certificado CCPDT",
    tag4: "Refuerzo positivo",
    tag5: "Ansiedad por separación",
    tag6: "Perros reactivos",
    tag7: "Bases para cachorros",
  },
  faq: {
    title: "Preguntas, respondidas",
    q1: "¿De verdad es refuerzo positivo?",
    a1: "Sí. TuringCare está construido en torno a métodos basados en recompensas y respaldados por la ciencia. No respaldamos collares de púas, descargas eléctricas ni técnicas basadas en el miedo.",
    q2: "¿Necesito un adiestrador/a para empezar?",
    a2: "No. Empieza el diario de conducta por tu cuenta hoy mismo. Cuando estés listo/a, el Resumen de conducta hace que incorporar un adiestrador/a sea muy sencillo.",
    q3: "¿Qué es un Resumen de conducta?",
    a3: "Un resumen exportable del perfil de tu perro, preocupaciones, objetivos y entradas del diario ABC — con un formato que permite a un adiestrador/a entender la situación en minutos.",
    q4: "¿Mis datos son privados?",
    a4: "Tu diario está vinculado a tu cuenta y solo se comparte cuando eliges exportar o enviar un Resumen. No vendemos datos.",
    q5: "¿Cuánto cuesta?",
    a5: "El diario principal y el Resumen de conducta son gratuitos mientras estamos en fase inicial. Empieza hoy y conservarás tus datos a medida que el producto crezca.",
  },
  footer: {
    brand: "TuringCare",
    tagline: "Apoyo humano y basado en recompensas para el adiestramiento canino.",
    navHow: "Cómo funciona",
    navBrief: "Resumen de conducta",
    navFaq: "Preguntas",
    builtFor: "Hecho para Turing",
  },
  auth: {
    loginTitle: "Iniciar sesión",
    registerTitle: "Crear cuenta",
    name: "Nombre",
    email: "Correo electrónico",
    password: "Contraseña",
    loginSubmit: "Iniciar sesión",
    loginPending: "Iniciando sesión…",
    registerSubmit: "Crear cuenta",
    registerPending: "Creando…",
    noAccount: "¿No tienes cuenta?",
    registerLink: "Registrarse",
    haveAccount: "¿Ya tienes cuenta?",
    loginLink: "Iniciar sesión",
    loginFailed: "Error al iniciar sesión",
    registerFailed: "Error al registrarse",
    registered: "Cuenta creada",
  },
  app: {
    title: "Tu panel",
    loading: "Cargando…",
    signOut: "Cerrar sesión",
    signedOut: "Sesión cerrada",
  },
  common: { loading: "Cargando…" },
} satisfies Catalog;
