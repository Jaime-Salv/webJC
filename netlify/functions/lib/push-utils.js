const webpush = require('web-push');

function requireEnvironment(names) {
    const missing = names.filter((name) => !process.env[name]);

    if (missing.length) throw new Error(`Faltan variables: ${missing.join(', ')}`);
}

function getSupabaseConfig() {
    requireEnvironment(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);

    return {
        supabaseUrl: process.env.SUPABASE_URL,
        serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY
    };
}

function configureWebPush() {
    requireEnvironment(['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']);

    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

function response(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
        },
        body: JSON.stringify(body)
    };
}

async function supabaseRequest(path, options = {}) {
    const config = getSupabaseConfig();
    const headers = {
        apikey: config.serviceKey,
        'Content-Type': 'application/json',
        ...options.headers
    };

    // Las claves JWT legacy necesitan Authorization. Las nuevas sb_secret_
    // funcionan como apikey del servidor y no deben enviarse como Bearer.
    if (!config.serviceKey.startsWith('sb_secret_')) {
        headers.Authorization = `Bearer ${config.serviceKey}`;
    }

    return fetch(`${config.supabaseUrl}/rest/v1/${path}`, { ...options, headers });
}

async function requireAdmin(event) {
    requireEnvironment(['SUPABASE_ANON_KEY']);
    const config = {
        ...getSupabaseConfig(),
        anonKey: process.env.SUPABASE_ANON_KEY
    };
    const authorization = event.headers.authorization || event.headers.Authorization;
    if (!authorization?.startsWith('Bearer ')) return null;

    const token = authorization.slice(7);
    const userResponse = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
        headers: {
            apikey: config.anonKey,
            Authorization: `Bearer ${token}`
        }
    });

    if (!userResponse.ok) return null;
    const user = await userResponse.json();

    const profileResponse = await supabaseRequest(
        `perfiles?id=eq.${encodeURIComponent(user.id)}&select=id,rol`
    );
    const profiles = await profileResponse.json();
    return profiles?.[0]?.rol === 'admin' ? user : null;
}

module.exports = {
    webpush,
    configureWebPush,
    response,
    supabaseRequest,
    requireAdmin
};
