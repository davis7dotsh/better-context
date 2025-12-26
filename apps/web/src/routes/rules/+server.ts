import { error } from "@sveltejs/kit";
import better_context from '$lib/assets/rules/better_context.mdc?raw';

export const GET = ({ url }) => {
    const rule = url.searchParams.get('rule');

    if (!rule) {
        error(400, 'Missing required query parameter: rule');
    }

    if (!better_context) {
        error(400, `Rule was not found!`)
    }

    return new Response(better_context, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8'
        }
    });
}
