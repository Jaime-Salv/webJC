const { response, supabaseRequest } = require('./lib/push-utils');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return response(405, { error: 'Método no permitido' });

    try {
        const { endpoint } = JSON.parse(event.body || '{}');
        if (!endpoint) return response(400, { error: 'Endpoint requerido' });

        const result = await supabaseRequest(
            `push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
            { method: 'DELETE', headers: { Prefer: 'return=minimal' } }
        );

        if (!result.ok) throw new Error(await result.text());
        return response(200, { ok: true });
    } catch (error) {
        console.error(error);
        return response(500, { error: 'No se ha podido eliminar la suscripción' });
    }
};
