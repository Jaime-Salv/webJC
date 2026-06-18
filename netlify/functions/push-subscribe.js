const { response, supabaseRequest } = require('./lib/push-utils');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return response(405, { error: 'Método no permitido' });

    try {
        const { subscription, userAgent } = JSON.parse(event.body || '{}');
        const endpoint = subscription?.endpoint;
        const p256dh = subscription?.keys?.p256dh;
        const auth = subscription?.keys?.auth;

        if (
            !endpoint ||
            !endpoint.startsWith('https://') ||
            endpoint.length > 2000 ||
            !p256dh ||
            !auth
        ) {
            return response(400, { error: 'Suscripción incompleta' });
        }

        const result = await supabaseRequest('push_subscriptions?on_conflict=endpoint', {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({
                endpoint,
                p256dh,
                auth,
                user_agent: String(userAgent || '').slice(0, 500),
                updated_at: new Date().toISOString()
            })
        });

        if (!result.ok) throw new Error(await result.text());
        return response(200, { ok: true });
    } catch (error) {
        console.error(error);
        return response(500, { error: 'No se ha podido guardar la suscripción' });
    }
};
