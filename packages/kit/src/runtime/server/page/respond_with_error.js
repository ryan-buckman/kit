import { render_response } from './render.js';
import { load_node } from './load_node.js';
import { coalesce_to_error } from '../../../utils/error.js';

/**
 * @typedef {import('./types.js').Loaded} Loaded
 * @typedef {import('types/internal').SSRNode} SSRNode
 * @typedef {import('types/internal').SSRRenderOptions} SSRRenderOptions
 * @typedef {import('types/internal').SSRRenderState} SSRRenderState
 */

/**
 * @param {{
 *   request: import('types/hooks').ServerRequest;
 *   options: SSRRenderOptions;
 *   state: SSRRenderState;
 *   $session: any;
 *   status: number;
 *   error: Error;
 *   ssr: boolean;
 * }} opts
 */
export async function respond_with_error({
	request,
	options,
	state,
	$session,
	status,
	error,
	ssr
}) {
	try {
		const default_layout = await options.manifest._.nodes[0](); // 0 is always the root layout
		const default_error = await options.manifest._.nodes[1](); // 1 is always the root error

		/** @type {Record<string, string>} */
		const params = {}; // error page has no params

		const layout_loaded = /** @type {Loaded} */ (
			await load_node({
				request,
				options,
				state,
				route: null,
				url: request.url, // TODO this is redundant, no?
				params,
				node: default_layout,
				$session,
				stuff: {},
				prerender_enabled: is_prerender_enabled(options, default_error, state),
				is_error: false
			})
		);

		const error_loaded = /** @type {Loaded} */ (
			await load_node({
				request,
				options,
				state,
				route: null,
				url: request.url,
				params,
				node: default_error,
				$session,
				stuff: layout_loaded ? layout_loaded.stuff : {},
				prerender_enabled: is_prerender_enabled(options, default_error, state),
				is_error: true,
				status,
				error
			})
		);

		return await render_response({
			options,
			$session,
			page_config: {
				hydrate: options.hydrate,
				router: options.router
			},
			stuff: error_loaded.stuff,
			status,
			error,
			branch: [layout_loaded, error_loaded],
			url: request.url,
			params,
			ssr
		});
	} catch (err) {
		const error = coalesce_to_error(err);

		options.handle_error(error, request);

		return {
			status: 500,
			headers: {},
			body: error.stack
		};
	}
}

/**
 * @param {SSRRenderOptions} options
 * @param {SSRNode} node
 * @param {SSRRenderState} state
 */
export function is_prerender_enabled(options, node, state) {
	return (
		options.prerender && (!!node.module.prerender || (!!state.prerender && state.prerender.all))
	);
}
