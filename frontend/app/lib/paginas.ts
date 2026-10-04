/**
 * Contenido de las páginas informativas del sitio (cómo funciona, acerca de, legales...) y de las que todavía
 * están por hacerse. Todo vive acá, en datos, y lo sirve una sola ruta (app/[pagina]/page.tsx): para cambiar un
 * texto o sumar una página alcanza con editar este archivo.
 */

export interface Seccion {
  titulo: string;
  parrafos?: string[];
  lista?: string[];
  /** Agrega el correo de contacto (o el aviso de que todavía no está habilitado) al final de la sección. */
  correo?: boolean;
}

interface Base {
  slug: string;
  titulo: string;
  /** Descripción para los buscadores (meta description). */
  descripcion: string;
  /** Ruta de la barra de navegación que se marca como actual, si la página forma parte de ella. */
  actual?: string;
}

export interface PaginaDeTexto extends Base {
  tipo: "texto";
  eyebrow: string;
  bajada: string;
  secciones: Seccion[];
  /** Los textos legales son un borrador hasta que alguien con criterio jurídico los revise. */
  preliminar?: boolean;
  actualizada?: string;
}

export interface PaginaProximamente extends Base {
  tipo: "proximamente";
  bajada: string;
  texto: string;
  /** Enlace alternativo para quien llega acá, además de volver al inicio y jugar. */
  alternativa?: { href: string; etiqueta: string };
}

export type Pagina = PaginaDeTexto | PaginaProximamente;

const FECHA_LEGALES = "3 de octubre de 2026";

const paginas: Pagina[] = [
  {
    tipo: "texto",
    slug: "como-funciona",
    titulo: "Cómo funciona",
    eyebrow: "CÓMO SE JUEGA",
    descripcion: "Las reglas de Banda Oriental: una canción uruguaya por día, seis intentos, pistas que se desbloquean y los colores de cada intento.",
    bajada: "Todos los días hay una canción uruguaya nueva. La escuchás de a una pista por vez y tenés seis intentos para adivinar cuál es.",
    secciones: [
      {
        titulo: "Las pistas",
        parrafos: [
          "Arrancás escuchando un solo instrumento: la batería. Cada intento que no acierta desbloquea otra pista, y la canción se va armando: primero el bajo, después la voz y por último el resto de los instrumentos.",
          "Para poder responder, primero tenés que darle play y escuchar la pista.",
        ],
      },
      {
        titulo: "Cómo responder",
        parrafos: [
          "Escribí en el buscador el título de la canción, el nombre del artista o el del disco, elegí una opción de la lista y enviala. Tenés seis intentos.",
        ],
      },
      {
        titulo: "Los colores",
        parrafos: ["Cada intento se compara con la canción del día en cuatro datos: año, género, artista y disco."],
        lista: [
          "Verde: el dato coincide.",
          "Amarillo (solo en el año): no es el año exacto. Una flecha te dice hacia dónde ir: ↑ si la canción es más nueva, ↓ si es más vieja.",
          "Rosa: el dato no coincide.",
          "Gris: todavía no tenemos ese dato de la canción.",
        ],
      },
      {
        titulo: "Puntos",
        parrafos: [
          "Cuantos menos intentos uses y más rápido aciertes, más puntos. Si ganás, podés guardar tu puntaje en el ranking con un nombre público que no puede repetirse con el de otra persona. Lo elegís la primera vez y después podés cambiarlo una vez cada 7 días. Hay rankings del día, de la semana, del mes y de todos los tiempos.",
        ],
      },
      {
        titulo: "Una canción por día",
        parrafos: [
          "La canción cambia todos los días a la medianoche, hora de Uruguay. Si no la sacás, la respuesta se muestra al terminar tus seis intentos.",
        ],
      },
      {
        titulo: "Tu historial",
        parrafos: [
          "Lo que vas jugando se guarda en tu navegador, sin necesidad de crear una cuenta: tus partidas, tus estadísticas y tu racha, que cuenta los días seguidos que ganaste.",
        ],
      },
    ],
  },
  {
    tipo: "texto",
    slug: "acerca",
    actual: "/acerca",
    titulo: "Acerca de",
    eyebrow: "ACERCA DE BANDA ORIENTAL",
    descripcion: "Banda Oriental es un juego diario de música uruguaya: una canción por día, seis intentos y pistas que se desbloquean.",
    bajada: "Un juego diario para escuchar, adivinar y descubrir música uruguaya.",
    secciones: [
      {
        titulo: "Qué es",
        parrafos: [
          "Banda Oriental es un juego gratuito con una canción uruguaya por día. Se arma como un rompecabezas de oído: escuchás un instrumento, probás una respuesta y cada error te revela otra pista.",
        ],
      },
      {
        titulo: "Por qué",
        parrafos: [
          "La música de Uruguay es enorme y variada: candombe, murga, folklore, rock, pop, tango, música tropical y mucho más. Queremos que el juego sea una excusa para reencontrarte con canciones que conocés y para descubrir otras que todavía no.",
        ],
      },
      {
        titulo: "De dónde salen los datos",
        parrafos: [
          "La información de artistas, discos y canciones viene de bases de datos abiertas, como MusicBrainz, y se revisa a mano. Si encontrás un dato equivocado o un artista que falta, contanos desde la página de sugerencias.",
          "Los derechos de las canciones pertenecen a sus artistas y a sus titulares.",
        ],
      },
      {
        titulo: "Créditos",
        lista: [
          "Datos de discos y canciones: MusicBrainz.",
          "Tipografía manuscrita: Caveat Brush, con licencia SIL Open Font License.",
          "Íconos de redes sociales: Simple Icons.",
        ],
      },
      {
        titulo: "Un proyecto en construcción",
        parrafos: [
          "Banda Oriental es un proyecto independiente y está creciendo. Hay cosas que todavía faltan, como el modo batalla, y las vamos sumando de a poco.",
        ],
      },
    ],
  },
  {
    tipo: "texto",
    slug: "contacto",
    titulo: "Contacto",
    eyebrow: "CONTACTO",
    descripcion: "Cómo comunicarte con el equipo de Banda Oriental: dudas, problemas, sugerencias y consultas de artistas y titulares.",
    bajada: "¿Una duda, un problema o una idea? Nos gusta leerte.",
    secciones: [
      { titulo: "Escribinos", parrafos: ["Podés comunicarte con nosotros por correo electrónico."], correo: true },
      {
        titulo: "Si algo no funciona",
        parrafos: ["Para poder ayudarte rápido, contanos:"],
        lista: [
          "Qué estabas haciendo cuando pasó.",
          "Desde qué dispositivo y navegador jugabas.",
          "Una captura de pantalla, si podés.",
        ],
      },
      {
        titulo: "Artistas y titulares de derechos",
        parrafos: [
          "Si sos artista o titular de derechos y tenés una consulta sobre una canción del juego, escribinos y la vemos con atención.",
        ],
      },
    ],
  },
  {
    tipo: "texto",
    slug: "sugerencias",
    titulo: "Sugerencias",
    eyebrow: "SUGERENCIAS",
    descripcion: "Contanos qué canciones o artistas faltan, qué datos corregir y qué ideas tenés para mejorar Banda Oriental.",
    bajada: "Ayudanos a que Banda Oriental tenga más música uruguaya y funcione mejor.",
    secciones: [
      {
        titulo: "Qué nos podés sugerir",
        lista: [
          "Canciones o artistas que faltan en el juego.",
          "Datos para corregir: año, género, disco o nombre de un artista.",
          "Ideas para mejorar el juego o nuevos modos.",
        ],
      },
      {
        titulo: "Cómo enviarla",
        parrafos: ["Escribinos con el asunto “Sugerencia” y contanos todo lo que sepas: cuanto más detalle, mejor."],
        correo: true,
      },
      {
        titulo: "Qué pasa después",
        parrafos: [
          "Leemos todas las sugerencias. No siempre podemos responder a cada una ni incorporarla, pero todas nos ayudan a decidir qué hacer a continuación.",
        ],
      },
    ],
  },
  {
    tipo: "texto",
    slug: "terminos",
    titulo: "Términos y condiciones",
    eyebrow: "LEGALES",
    descripcion: "Términos y condiciones de uso de Banda Oriental, el juego diario de música uruguaya.",
    bajada: "Las reglas básicas para usar Banda Oriental.",
    preliminar: true,
    actualizada: FECHA_LEGALES,
    secciones: [
      {
        titulo: "1. Aceptación",
        parrafos: ["Al usar Banda Oriental aceptás estos términos. Si no estás de acuerdo con alguno, te pedimos que no uses el servicio."],
      },
      {
        titulo: "2. El servicio",
        parrafos: [
          "Banda Oriental es un juego gratuito con una canción por día. Podemos cambiar, suspender o dejar de ofrecer cualquier parte del servicio, y puede haber interrupciones o errores.",
        ],
      },
      {
        titulo: "3. Uso aceptable",
        lista: [
          "Banda Oriental es un juego solo para personas. No uses programas automáticos, bots, scripts ni agentes de IA para jugar, crear cuentas, alterar resultados o sobrecargar el servicio, ni rastreadores para copiar su contenido más allá de la portada.",
          "Para cuidar el servicio podemos limitar la cantidad de pedidos, pedirte una comprobación de que sos una persona y bloquear el acceso de programas automáticos.",
          "Los nombres que elijas para el ranking no pueden ser ofensivos, engañosos ni publicitarios. Podemos rechazarlos o quitarlos.",
          "No intentes acceder a partes del servicio que no son públicas.",
        ],
      },
      {
        titulo: "4. Música y contenidos",
        parrafos: [
          "Las canciones, grabaciones y marcas mencionadas pertenecen a sus artistas y titulares. El juego las usa para dar a conocer música uruguaya. Si sos titular de derechos y tenés una consulta, escribinos desde la página de contacto.",
        ],
      },
      {
        titulo: "5. Cuentas",
        parrafos: [
          "Cuando existan cuentas, vas a ser responsable de cuidar tus credenciales y de lo que se haga con ellas.",
        ],
      },
      {
        titulo: "6. Sin garantías",
        parrafos: [
          "El servicio se ofrece tal como está, sin garantías de que esté siempre disponible o libre de errores. En la medida que la ley lo permita, no nos hacemos responsables por daños derivados de su uso.",
        ],
      },
      {
        titulo: "7. Cambios en estos términos",
        parrafos: ["Podemos actualizar estos términos. La fecha de la última actualización figura al comienzo de esta página."],
      },
      {
        titulo: "8. Ley aplicable",
        parrafos: ["Estos términos se rigen por las leyes de la República Oriental del Uruguay."],
      },
    ],
  },
  {
    tipo: "texto",
    slug: "privacidad",
    titulo: "Política de privacidad",
    eyebrow: "LEGALES",
    descripcion: "Qué datos usa Banda Oriental, para qué y cómo podés ejercer tus derechos sobre ellos.",
    bajada: "Para jugar no te pedimos nombre, correo ni contraseña. Si creás una cuenta, esto es lo que guardamos.",
    preliminar: true,
    actualizada: FECHA_LEGALES,
    secciones: [
      {
        titulo: "Qué datos guardamos",
        lista: [
          "Un identificador anónimo de tu dispositivo, generado al azar y guardado en tu navegador. Nos permite recordar tus intentos del día.",
          "Tus intentos y resultados de cada día, y tus estadísticas (partidas jugadas, aciertos, racha y puntaje total), que calcula y guarda nuestro servidor, asociados a ese identificador anónimo o, si tenés cuenta, a tu cuenta.",
          "El nombre público que elijas para el ranking, solo si decidís guardar tu puntaje: lo elegís la primera vez y después podés cambiarlo una vez cada 7 días, no puede repetirse con el de otra persona, lo ve cualquiera que mire los rankings y se conserva si después creás una cuenta.",
          "Si creás una cuenta: tu correo y tu contraseña (guardada de forma que no podemos leerla), y las partidas y los puntajes asociados a la cuenta, que así te siguen a cualquier dispositivo.",
          "Los enlaces que te mandamos por correo (confirmar, entrar o cambiar la contraseña), hasta que se usan o vencen.",
          "Datos técnicos que cualquier servidor recibe al conectarse, como la dirección IP y el tipo de navegador, que quedan en los registros de nuestros proveedores de infraestructura.",
        ],
      },
      {
        titulo: "Lo que queda en tu navegador",
        parrafos: [
          "Tus estadísticas y tu racha las calcula y guarda nuestro servidor, y tu historial se muestra a partir de lo que guarda; además quedan copiados en tu navegador, en el almacenamiento local, para que el juego responda rápido. Si borrás los datos del navegador se pierde el identificador anónimo, y entonces ya no podemos vincular lo que jugaste sin cuenta a ese dispositivo.",
          "Si iniciás sesión, también se guarda ahí una clave de sesión que identifica tu cuenta en este dispositivo. Al cerrar sesión se borra.",
        ],
      },
      {
        titulo: "Si jugás sin cuenta",
        parrafos: [
          "Tus partidas y estadísticas quedan en nuestro servidor, asociadas al identificador anónimo de tu navegador. Si pasan siete días sin que juegues, las borramos junto con tu nombre del ranking, porque ya no hay forma de saber de quién son. Si creás una cuenta antes, tus partidas pasan a tu cuenta y no se borran; la única excepción es un día que tu cuenta ya había jugado, porque cada día cuenta una sola vez.",
        ],
      },
      {
        titulo: "Cookies y seguimiento",
        parrafos: [
          "No usamos cookies de publicidad ni herramientas para seguirte entre sitios. Usamos el almacenamiento del navegador solo para que el juego funcione.",
          "Medimos las visitas con Vercel Web Analytics, que cuenta páginas vistas sin cookies y sin identificarte personalmente. También usamos Google Search Console, que nos muestra cómo aparece el sitio en las búsquedas; no instalamos Google Analytics ni otras herramientas de Google en el sitio.",
        ],
      },
      {
        titulo: "Para qué los usamos",
        parrafos: [
          "Para que el juego funcione (recordar tu partida), para armar los rankings (del día, de la semana, del mes y de todos los tiempos) y para mantener y mejorar el servicio. No vendemos tus datos.",
        ],
      },
      {
        titulo: "Seguridad y programas automáticos",
        parrafos: [
          "Para distinguir a las personas de los programas automáticos podemos usar Cloudflare Turnstile, un servicio que hace una comprobación breve en tu navegador (casi siempre sin que tengas que hacer nada) y que puede recibir datos técnicos como tu dirección IP y el tipo de navegador. Cloudflare lo presta como proveedor y no lo usamos para publicidad.",
          "También guardamos en los registros de nuestros servidores la dirección IP de quien alcanza los límites de pedidos, solo para cuidar la seguridad del servicio y por el tiempo que haga falta para eso. La dirección IP se usa para la seguridad y no para identificarte.",
        ],
      },
      {
        titulo: "Correos",
        parrafos: [
          "Los correos de la cuenta (confirmar el correo, enlace de acceso y cambio de contraseña) los envía un proveedor externo, Resend, por encargo nuestro. Solo mandamos esos mensajes: no enviamos publicidad.",
        ],
      },
      {
        titulo: "Borrar tu cuenta",
        parrafos: [
          "Podés borrar tu cuenta cuando quieras desde Mi cuenta, con el botón Borrar mi cuenta: se borran tu correo, tus sesiones, tus partidas, tus puntajes, tus estadísticas y tu nombre del ranking, que queda libre para otra persona. Las partidas jugadas sin cuenta que no llegaron a pasar a ninguna cuenta se borran solas a los siete días sin jugar.",
        ],
      },
      {
        titulo: "Proveedores",
        parrafos: [
          "El sitio, la base de datos y los archivos de audio se alojan en servicios de terceros. Esos proveedores pueden procesar datos técnicos para prestarnos el servicio.",
        ],
      },
      {
        titulo: "Tus derechos",
        parrafos: [
          "De acuerdo con la Ley N.º 18.331 de Protección de Datos Personales de Uruguay, podés pedir acceso, rectificación o eliminación de los datos que te correspondan. Escribinos desde la página de contacto e indicá tu identificador de dispositivo si lo conocés.",
        ],
      },
      {
        titulo: "Cambios",
        parrafos: [
          "Cuando agreguemos funciones que usen datos nuevos, vamos a actualizar esta política y a avisarlo acá antes de empezar a usarlos.",
        ],
      },
    ],
  },
  {
    tipo: "proximamente",
    slug: "batalla",
    actual: "/batalla",
    titulo: "Modo batalla",
    descripcion: "El modo batalla de Banda Oriental, para competir con amigos, llega pronto.",
    bajada: "Desafiá a tus amigos con la misma canción y mirá quién la saca primero.",
    texto: "Estamos terminando de armar el modo batalla. Mientras tanto, podés jugar la canción del día.",
  },
];

/** Lo que muestran /login, /cuenta y /cuenta/entrar mientras las cuentas están apagadas (ver cuentas/activas.ts). */
export const PAGINA_CUENTAS_PROXIMAMENTE: Extract<Pagina, { tipo: "proximamente" }> = {
  tipo: "proximamente",
  slug: "login",
  actual: "/login",
  titulo: "Iniciar sesión",
  descripcion: "Las cuentas de Banda Oriental, para guardar tu historial en cualquier dispositivo, llegan pronto.",
  bajada: "Pronto vas a poder crear una cuenta para guardar tu historial en cualquier dispositivo.",
  texto: "Estamos terminando las cuentas, con contraseña o con un enlace por correo, a elección. Mientras tanto, lo que jugás se guarda en este navegador.",
  alternativa: { href: "/historial", etiqueta: "Ver mi historial" },
};

export const PAGINAS: Record<string, Pagina> = Object.fromEntries(paginas.map((pagina) => [pagina.slug, pagina]));
export const SLUGS: string[] = paginas.map((pagina) => pagina.slug);

export const paginaPorSlug = (slug: string): Pagina | undefined => PAGINAS[slug];

/** Las páginas con contenido real, que se pueden indexar (las que todavía no existen quedan afuera). */
export const PAGINAS_DE_TEXTO = paginas.filter((pagina): pagina is PaginaDeTexto => pagina.tipo === "texto");
