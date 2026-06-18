const { webpush, response, supabaseRequest, requireAdmin } = require('./lib/push-utils');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return response(405, { error: 'Método no permitido' });

    try {
        const admin = await requireAdmin(event);
        if (!admin) return response(403, { error: 'Acceso denegado' });

        const { idProcesion, hermandad, localidad } = JSON.parse(event.body || '{}');
        if (!idProcesion || !hermandad) return response(400, { error: 'Datos del directo incompletos' });

        const subscriptionsResponse = await supabaseRequest(
            'push_subscriptions?select=endpoint,p256dh,auth'
        );
        if (!subscriptionsResponse.ok) throw new Error(await subscriptionsResponse.text());

        const subscriptions = await subscriptionsResponse.json();
        const payload = JSON.stringify({
            title: '🔴 La banda está en directo',
            body: `${hermandad}${localidad ? ` · ${localidad}` : ''}`,
            url: `/templates/live.html?id=${encodeURIComponent(idProcesion)}`,
            tag: `directo-${idProcesion}`
        });

        let sent = 0;
        let removed = 0;

        await Promise.all(subscriptions.map(async (item) => {
            try {
                await webpush.sendNotification({
                    endpoint: item.endpoint,
                    keys: { p256dh: item.p256dh, auth: item.auth }
                }, payload);
                sent += 1;
            } catch (error) {
                if (error.statusCode === 404 || error.statusCode === 410) {
                    removed += 1;
                    await supabaseRequest(
                        `push_subscriptions?endpoint=eq.${encodeURIComponent(item.endpoint)}`,
                        { method: 'DELETE', headers: { Prefer: 'return=minimal' } }
                    );
                    return;
                }
                console.error('Error enviando push:', error.message);
            }
        }));

        return response(200, { ok: true, sent, removed });
    } catch (error) {
        console.error(error);
        return response(500, { error: 'No se han podido enviar los avisos' });
    }
};
