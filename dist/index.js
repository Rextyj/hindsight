// node_modules/@vectorize-io/hindsight-client/dist/index.mjs
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var serializeFormDataPair = (data, key, value) => {
  if (typeof value === "string" || value instanceof Blob) {
    data.append(key, value);
  } else if (value instanceof Date) {
    data.append(key, value.toISOString());
  } else {
    data.append(key, JSON.stringify(value));
  }
};
var formDataBodySerializer = {
  bodySerializer: (body) => {
    const data = new FormData();
    Object.entries(body).forEach(([key, value]) => {
      if (value === void 0 || value === null) {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((v) => serializeFormDataPair(data, key, v));
      } else {
        serializeFormDataPair(data, key, value);
      }
    });
    return data;
  }
};
var jsonBodySerializer = {
  bodySerializer: (body) => JSON.stringify(
    body,
    (_key, value) => typeof value === "bigint" ? value.toString() : value
  )
};
var extraPrefixesMap = {
  $body_: "body",
  $headers_: "headers",
  $path_: "path",
  $query_: "query"
};
var extraPrefixes = Object.entries(extraPrefixesMap);
var createSseClient = ({
  onRequest,
  onSseError,
  onSseEvent,
  responseTransformer,
  responseValidator,
  sseDefaultRetryDelay,
  sseMaxRetryAttempts,
  sseMaxRetryDelay,
  sseSleepFn,
  url,
  ...options
}) => {
  let lastEventId;
  const sleep = sseSleepFn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const createStream = async function* () {
    let retryDelay = sseDefaultRetryDelay ?? 3e3;
    let attempt = 0;
    const signal = options.signal ?? new AbortController().signal;
    while (true) {
      if (signal.aborted) break;
      attempt++;
      const headers = options.headers instanceof Headers ? options.headers : new Headers(options.headers);
      if (lastEventId !== void 0) {
        headers.set("Last-Event-ID", lastEventId);
      }
      try {
        const requestInit = {
          redirect: "follow",
          ...options,
          body: options.serializedBody,
          headers,
          signal
        };
        let request = new Request(url, requestInit);
        if (onRequest) {
          request = await onRequest(url, requestInit);
        }
        const _fetch = options.fetch ?? globalThis.fetch;
        const response = await _fetch(request);
        if (!response.ok)
          throw new Error(
            `SSE failed: ${response.status} ${response.statusText}`
          );
        if (!response.body) throw new Error("No body in SSE response");
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        const abortHandler = () => {
          try {
            reader.cancel();
          } catch {
          }
        };
        signal.addEventListener("abort", abortHandler);
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += value;
            const chunks = buffer.split("\n\n");
            buffer = chunks.pop() ?? "";
            for (const chunk of chunks) {
              const lines = chunk.split("\n");
              const dataLines = [];
              let eventName;
              for (const line of lines) {
                if (line.startsWith("data:")) {
                  dataLines.push(line.replace(/^data:\s*/, ""));
                } else if (line.startsWith("event:")) {
                  eventName = line.replace(/^event:\s*/, "");
                } else if (line.startsWith("id:")) {
                  lastEventId = line.replace(/^id:\s*/, "");
                } else if (line.startsWith("retry:")) {
                  const parsed = Number.parseInt(
                    line.replace(/^retry:\s*/, ""),
                    10
                  );
                  if (!Number.isNaN(parsed)) {
                    retryDelay = parsed;
                  }
                }
              }
              let data;
              let parsedJson = false;
              if (dataLines.length) {
                const rawData = dataLines.join("\n");
                try {
                  data = JSON.parse(rawData);
                  parsedJson = true;
                } catch {
                  data = rawData;
                }
              }
              if (parsedJson) {
                if (responseValidator) {
                  await responseValidator(data);
                }
                if (responseTransformer) {
                  data = await responseTransformer(data);
                }
              }
              onSseEvent?.({
                data,
                event: eventName,
                id: lastEventId,
                retry: retryDelay
              });
              if (dataLines.length) {
                yield data;
              }
            }
          }
        } finally {
          signal.removeEventListener("abort", abortHandler);
          reader.releaseLock();
        }
        break;
      } catch (error) {
        onSseError?.(error);
        if (sseMaxRetryAttempts !== void 0 && attempt >= sseMaxRetryAttempts) {
          break;
        }
        const backoff = Math.min(
          retryDelay * 2 ** (attempt - 1),
          sseMaxRetryDelay ?? 3e4
        );
        await sleep(backoff);
      }
    }
  };
  const stream = createStream();
  return { stream };
};
var separatorArrayExplode = (style) => {
  switch (style) {
    case "label":
      return ".";
    case "matrix":
      return ";";
    case "simple":
      return ",";
    default:
      return "&";
  }
};
var separatorArrayNoExplode = (style) => {
  switch (style) {
    case "form":
      return ",";
    case "pipeDelimited":
      return "|";
    case "spaceDelimited":
      return "%20";
    default:
      return ",";
  }
};
var separatorObjectExplode = (style) => {
  switch (style) {
    case "label":
      return ".";
    case "matrix":
      return ";";
    case "simple":
      return ",";
    default:
      return "&";
  }
};
var serializeArrayParam = ({
  allowReserved,
  explode,
  name,
  style,
  value
}) => {
  if (!explode) {
    const joinedValues2 = (allowReserved ? value : value.map((v) => encodeURIComponent(v))).join(separatorArrayNoExplode(style));
    switch (style) {
      case "label":
        return `.${joinedValues2}`;
      case "matrix":
        return `;${name}=${joinedValues2}`;
      case "simple":
        return joinedValues2;
      default:
        return `${name}=${joinedValues2}`;
    }
  }
  const separator = separatorArrayExplode(style);
  const joinedValues = value.map((v) => {
    if (style === "label" || style === "simple") {
      return allowReserved ? v : encodeURIComponent(v);
    }
    return serializePrimitiveParam({
      allowReserved,
      name,
      value: v
    });
  }).join(separator);
  return style === "label" || style === "matrix" ? separator + joinedValues : joinedValues;
};
var serializePrimitiveParam = ({
  allowReserved,
  name,
  value
}) => {
  if (value === void 0 || value === null) {
    return "";
  }
  if (typeof value === "object") {
    throw new Error(
      "Deeply-nested arrays/objects aren\u2019t supported. Provide your own `querySerializer()` to handle these."
    );
  }
  return `${name}=${allowReserved ? value : encodeURIComponent(value)}`;
};
var serializeObjectParam = ({
  allowReserved,
  explode,
  name,
  style,
  value,
  valueOnly
}) => {
  if (value instanceof Date) {
    return valueOnly ? value.toISOString() : `${name}=${value.toISOString()}`;
  }
  if (style !== "deepObject" && !explode) {
    let values = [];
    Object.entries(value).forEach(([key, v]) => {
      values = [
        ...values,
        key,
        allowReserved ? v : encodeURIComponent(v)
      ];
    });
    const joinedValues2 = values.join(",");
    switch (style) {
      case "form":
        return `${name}=${joinedValues2}`;
      case "label":
        return `.${joinedValues2}`;
      case "matrix":
        return `;${name}=${joinedValues2}`;
      default:
        return joinedValues2;
    }
  }
  const separator = separatorObjectExplode(style);
  const joinedValues = Object.entries(value).map(
    ([key, v]) => serializePrimitiveParam({
      allowReserved,
      name: style === "deepObject" ? `${name}[${key}]` : key,
      value: v
    })
  ).join(separator);
  return style === "label" || style === "matrix" ? separator + joinedValues : joinedValues;
};
var PATH_PARAM_RE = /\{[^{}]+\}/g;
var defaultPathSerializer = ({ path, url: _url }) => {
  let url = _url;
  const matches = _url.match(PATH_PARAM_RE);
  if (matches) {
    for (const match of matches) {
      let explode = false;
      let name = match.substring(1, match.length - 1);
      let style = "simple";
      if (name.endsWith("*")) {
        explode = true;
        name = name.substring(0, name.length - 1);
      }
      if (name.startsWith(".")) {
        name = name.substring(1);
        style = "label";
      } else if (name.startsWith(";")) {
        name = name.substring(1);
        style = "matrix";
      }
      const value = path[name];
      if (value === void 0 || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        url = url.replace(
          match,
          serializeArrayParam({ explode, name, style, value })
        );
        continue;
      }
      if (typeof value === "object") {
        url = url.replace(
          match,
          serializeObjectParam({
            explode,
            name,
            style,
            value,
            valueOnly: true
          })
        );
        continue;
      }
      if (style === "matrix") {
        url = url.replace(
          match,
          `;${serializePrimitiveParam({
            name,
            value
          })}`
        );
        continue;
      }
      const replaceValue = encodeURIComponent(
        style === "label" ? `.${value}` : value
      );
      url = url.replace(match, replaceValue);
    }
  }
  return url;
};
var getUrl = ({
  baseUrl,
  path,
  query,
  querySerializer,
  url: _url
}) => {
  const pathUrl = _url.startsWith("/") ? _url : `/${_url}`;
  let url = (baseUrl ?? "") + pathUrl;
  if (path) {
    url = defaultPathSerializer({ path, url });
  }
  let search = query ? querySerializer(query) : "";
  if (search.startsWith("?")) {
    search = search.substring(1);
  }
  if (search) {
    url += `?${search}`;
  }
  return url;
};
function getValidRequestBody(options) {
  const hasBody = options.body !== void 0;
  const isSerializedBody = hasBody && options.bodySerializer;
  if (isSerializedBody) {
    if ("serializedBody" in options) {
      const hasSerializedBody = options.serializedBody !== void 0 && options.serializedBody !== "";
      return hasSerializedBody ? options.serializedBody : null;
    }
    return options.body !== "" ? options.body : null;
  }
  if (hasBody) {
    return options.body;
  }
  return void 0;
}
var getAuthToken = async (auth, callback) => {
  const token = typeof callback === "function" ? await callback(auth) : callback;
  if (!token) {
    return;
  }
  if (auth.scheme === "bearer") {
    return `Bearer ${token}`;
  }
  if (auth.scheme === "basic") {
    return `Basic ${btoa(token)}`;
  }
  return token;
};
var createQuerySerializer = ({
  parameters = {},
  ...args
} = {}) => {
  const querySerializer = (queryParams) => {
    const search = [];
    if (queryParams && typeof queryParams === "object") {
      for (const name in queryParams) {
        const value = queryParams[name];
        if (value === void 0 || value === null) {
          continue;
        }
        const options = parameters[name] || args;
        if (Array.isArray(value)) {
          const serializedArray = serializeArrayParam({
            allowReserved: options.allowReserved,
            explode: true,
            name,
            style: "form",
            value,
            ...options.array
          });
          if (serializedArray) search.push(serializedArray);
        } else if (typeof value === "object") {
          const serializedObject = serializeObjectParam({
            allowReserved: options.allowReserved,
            explode: true,
            name,
            style: "deepObject",
            value,
            ...options.object
          });
          if (serializedObject) search.push(serializedObject);
        } else {
          const serializedPrimitive = serializePrimitiveParam({
            allowReserved: options.allowReserved,
            name,
            value
          });
          if (serializedPrimitive) search.push(serializedPrimitive);
        }
      }
    }
    return search.join("&");
  };
  return querySerializer;
};
var getParseAs = (contentType) => {
  if (!contentType) {
    return "stream";
  }
  const cleanContent = contentType.split(";")[0]?.trim();
  if (!cleanContent) {
    return;
  }
  if (cleanContent.startsWith("application/json") || cleanContent.endsWith("+json")) {
    return "json";
  }
  if (cleanContent === "multipart/form-data") {
    return "formData";
  }
  if (["application/", "audio/", "image/", "video/"].some(
    (type) => cleanContent.startsWith(type)
  )) {
    return "blob";
  }
  if (cleanContent.startsWith("text/")) {
    return "text";
  }
  return;
};
var checkForExistence = (options, name) => {
  if (!name) {
    return false;
  }
  if (options.headers.has(name) || options.query?.[name] || options.headers.get("Cookie")?.includes(`${name}=`)) {
    return true;
  }
  return false;
};
var setAuthParams = async ({
  security,
  ...options
}) => {
  for (const auth of security) {
    if (checkForExistence(options, auth.name)) {
      continue;
    }
    const token = await getAuthToken(auth, options.auth);
    if (!token) {
      continue;
    }
    const name = auth.name ?? "Authorization";
    switch (auth.in) {
      case "query":
        if (!options.query) {
          options.query = {};
        }
        options.query[name] = token;
        break;
      case "cookie":
        options.headers.append("Cookie", `${name}=${token}`);
        break;
      case "header":
      default:
        options.headers.set(name, token);
        break;
    }
  }
};
var buildUrl = (options) => getUrl({
  baseUrl: options.baseUrl,
  path: options.path,
  query: options.query,
  querySerializer: typeof options.querySerializer === "function" ? options.querySerializer : createQuerySerializer(options.querySerializer),
  url: options.url
});
var mergeConfigs = (a, b) => {
  const config = { ...a, ...b };
  if (config.baseUrl?.endsWith("/")) {
    config.baseUrl = config.baseUrl.substring(0, config.baseUrl.length - 1);
  }
  config.headers = mergeHeaders(a.headers, b.headers);
  return config;
};
var headersEntries = (headers) => {
  const entries = [];
  headers.forEach((value, key) => {
    entries.push([key, value]);
  });
  return entries;
};
var mergeHeaders = (...headers) => {
  const mergedHeaders = new Headers();
  for (const header of headers) {
    if (!header) {
      continue;
    }
    const iterator = header instanceof Headers ? headersEntries(header) : Object.entries(header);
    for (const [key, value] of iterator) {
      if (value === null) {
        mergedHeaders.delete(key);
      } else if (Array.isArray(value)) {
        for (const v of value) {
          mergedHeaders.append(key, v);
        }
      } else if (value !== void 0) {
        mergedHeaders.set(
          key,
          typeof value === "object" ? JSON.stringify(value) : value
        );
      }
    }
  }
  return mergedHeaders;
};
var Interceptors = class {
  constructor() {
    this.fns = [];
  }
  clear() {
    this.fns = [];
  }
  eject(id) {
    const index = this.getInterceptorIndex(id);
    if (this.fns[index]) {
      this.fns[index] = null;
    }
  }
  exists(id) {
    const index = this.getInterceptorIndex(id);
    return Boolean(this.fns[index]);
  }
  getInterceptorIndex(id) {
    if (typeof id === "number") {
      return this.fns[id] ? id : -1;
    }
    return this.fns.indexOf(id);
  }
  update(id, fn) {
    const index = this.getInterceptorIndex(id);
    if (this.fns[index]) {
      this.fns[index] = fn;
      return id;
    }
    return false;
  }
  use(fn) {
    this.fns.push(fn);
    return this.fns.length - 1;
  }
};
var createInterceptors = () => ({
  error: new Interceptors(),
  request: new Interceptors(),
  response: new Interceptors()
});
var defaultQuerySerializer = createQuerySerializer({
  allowReserved: false,
  array: {
    explode: true,
    style: "form"
  },
  object: {
    explode: true,
    style: "deepObject"
  }
});
var defaultHeaders = {
  "Content-Type": "application/json"
};
var createConfig = (override = {}) => ({
  ...jsonBodySerializer,
  headers: defaultHeaders,
  parseAs: "auto",
  querySerializer: defaultQuerySerializer,
  ...override
});
var createClient = (config = {}) => {
  let _config = mergeConfigs(createConfig(), config);
  const getConfig = () => ({ ..._config });
  const setConfig = (config2) => {
    _config = mergeConfigs(_config, config2);
    return getConfig();
  };
  const interceptors = createInterceptors();
  const beforeRequest = async (options) => {
    const opts = {
      ..._config,
      ...options,
      fetch: options.fetch ?? _config.fetch ?? globalThis.fetch,
      headers: mergeHeaders(_config.headers, options.headers),
      serializedBody: void 0
    };
    if (opts.security) {
      await setAuthParams({
        ...opts,
        security: opts.security
      });
    }
    if (opts.requestValidator) {
      await opts.requestValidator(opts);
    }
    if (opts.body !== void 0 && opts.bodySerializer) {
      opts.serializedBody = opts.bodySerializer(opts.body);
    }
    if (opts.body === void 0 || opts.serializedBody === "") {
      opts.headers.delete("Content-Type");
    }
    const url = buildUrl(opts);
    return { opts, url };
  };
  const request = async (options) => {
    const { opts, url } = await beforeRequest(options);
    const { client: _client, ...optsForRequest } = opts;
    const requestInit = {
      redirect: "follow",
      ...optsForRequest,
      body: getValidRequestBody(opts)
    };
    let request2 = new Request(url, requestInit);
    for (const fn of interceptors.request.fns) {
      if (fn) {
        request2 = await fn(request2, opts);
      }
    }
    const _fetch = opts.fetch;
    let response;
    try {
      response = await _fetch(request2);
    } catch (error2) {
      let finalError2 = error2;
      for (const fn of interceptors.error.fns) {
        if (fn) {
          finalError2 = await fn(
            error2,
            void 0,
            request2,
            opts
          );
        }
      }
      finalError2 = finalError2 || {};
      if (opts.throwOnError) {
        throw finalError2;
      }
      return opts.responseStyle === "data" ? void 0 : {
        error: finalError2,
        request: request2,
        response: void 0
      };
    }
    for (const fn of interceptors.response.fns) {
      if (fn) {
        response = await fn(response, request2, opts);
      }
    }
    const result = {
      request: request2,
      response
    };
    if (response.ok) {
      const parseAs = (opts.parseAs === "auto" ? getParseAs(response.headers.get("Content-Type")) : opts.parseAs) ?? "json";
      if (response.status === 204 || response.headers.get("Content-Length") === "0") {
        let emptyData;
        switch (parseAs) {
          case "arrayBuffer":
          case "blob":
          case "text":
            emptyData = await response[parseAs]();
            break;
          case "formData":
            emptyData = new FormData();
            break;
          case "stream":
            emptyData = response.body;
            break;
          case "json":
          default:
            emptyData = {};
            break;
        }
        return opts.responseStyle === "data" ? emptyData : {
          data: emptyData,
          ...result
        };
      }
      let data;
      switch (parseAs) {
        case "arrayBuffer":
        case "blob":
        case "formData":
        case "json":
        case "text":
          data = await response[parseAs]();
          break;
        case "stream":
          return opts.responseStyle === "data" ? response.body : {
            data: response.body,
            ...result
          };
      }
      if (parseAs === "json") {
        if (opts.responseValidator) {
          await opts.responseValidator(data);
        }
        if (opts.responseTransformer) {
          data = await opts.responseTransformer(data);
        }
      }
      return opts.responseStyle === "data" ? data : {
        data,
        ...result
      };
    }
    const textError = await response.text();
    let jsonError;
    try {
      jsonError = JSON.parse(textError);
    } catch {
    }
    const error = jsonError ?? textError;
    let finalError = error;
    for (const fn of interceptors.error.fns) {
      if (fn) {
        finalError = await fn(error, response, request2, opts);
      }
    }
    finalError = finalError || {};
    if (opts.throwOnError) {
      throw finalError;
    }
    return opts.responseStyle === "data" ? void 0 : {
      error: finalError,
      ...result
    };
  };
  const makeMethodFn = (method) => (options) => request({ ...options, method });
  const makeSseFn = (method) => async (options) => {
    const { opts, url } = await beforeRequest(options);
    return createSseClient({
      ...opts,
      body: opts.body,
      headers: opts.headers,
      method,
      onRequest: async (url2, init) => {
        let request2 = new Request(url2, init);
        for (const fn of interceptors.request.fns) {
          if (fn) {
            request2 = await fn(request2, opts);
          }
        }
        return request2;
      },
      url
    });
  };
  return {
    buildUrl,
    connect: makeMethodFn("CONNECT"),
    delete: makeMethodFn("DELETE"),
    get: makeMethodFn("GET"),
    getConfig,
    head: makeMethodFn("HEAD"),
    interceptors,
    options: makeMethodFn("OPTIONS"),
    patch: makeMethodFn("PATCH"),
    post: makeMethodFn("POST"),
    put: makeMethodFn("PUT"),
    request,
    setConfig,
    sse: {
      connect: makeSseFn("CONNECT"),
      delete: makeSseFn("DELETE"),
      get: makeSseFn("GET"),
      head: makeSseFn("HEAD"),
      options: makeSseFn("OPTIONS"),
      patch: makeSseFn("PATCH"),
      post: makeSseFn("POST"),
      put: makeSseFn("PUT"),
      trace: makeSseFn("TRACE")
    },
    trace: makeMethodFn("TRACE")
  };
};
var sdk_gen_exports = {};
__export(sdk_gen_exports, {
  addBankBackground: () => addBankBackground,
  auditLogStats: () => auditLogStats,
  cancelOperation: () => cancelOperation,
  clearBankMemories: () => clearBankMemories,
  clearMemoryObservations: () => clearMemoryObservations,
  clearObservations: () => clearObservations,
  createDirective: () => createDirective,
  createMentalModel: () => createMentalModel,
  createOrUpdateBank: () => createOrUpdateBank,
  createWebhook: () => createWebhook,
  deleteBank: () => deleteBank,
  deleteDirective: () => deleteDirective,
  deleteDocument: () => deleteDocument,
  deleteMentalModel: () => deleteMentalModel,
  deleteWebhook: () => deleteWebhook,
  fileRetain: () => fileRetain,
  getAgentStats: () => getAgentStats,
  getBankConfig: () => getBankConfig,
  getBankProfile: () => getBankProfile,
  getChunk: () => getChunk,
  getDirective: () => getDirective,
  getDocument: () => getDocument,
  getEntity: () => getEntity,
  getGraph: () => getGraph,
  getMemory: () => getMemory,
  getMentalModel: () => getMentalModel,
  getMentalModelHistory: () => getMentalModelHistory,
  getObservationHistory: () => getObservationHistory,
  getOperationStatus: () => getOperationStatus,
  getVersion: () => getVersion,
  healthEndpointHealthGet: () => healthEndpointHealthGet,
  listAuditLogs: () => listAuditLogs,
  listBanks: () => listBanks,
  listDirectives: () => listDirectives,
  listDocuments: () => listDocuments,
  listEntities: () => listEntities,
  listMemories: () => listMemories,
  listMentalModels: () => listMentalModels,
  listOperations: () => listOperations,
  listTags: () => listTags,
  listWebhookDeliveries: () => listWebhookDeliveries,
  listWebhooks: () => listWebhooks,
  metricsEndpointMetricsGet: () => metricsEndpointMetricsGet,
  recallMemories: () => recallMemories,
  recoverConsolidation: () => recoverConsolidation,
  reflect: () => reflect,
  refreshMentalModel: () => refreshMentalModel,
  regenerateEntityObservations: () => regenerateEntityObservations,
  resetBankConfig: () => resetBankConfig,
  retainMemories: () => retainMemories,
  retryOperation: () => retryOperation,
  triggerConsolidation: () => triggerConsolidation,
  updateBank: () => updateBank,
  updateBankConfig: () => updateBankConfig,
  updateBankDisposition: () => updateBankDisposition,
  updateDirective: () => updateDirective,
  updateDocument: () => updateDocument,
  updateMentalModel: () => updateMentalModel,
  updateWebhook: () => updateWebhook
});
var client = createClient(createConfig());
var healthEndpointHealthGet = (options) => (options?.client ?? client).get({ url: "/health", ...options });
var getVersion = (options) => (options?.client ?? client).get({
  url: "/version",
  ...options
});
var metricsEndpointMetricsGet = (options) => (options?.client ?? client).get({ url: "/metrics", ...options });
var getGraph = (options) => (options.client ?? client).get({ url: "/v1/default/banks/{bank_id}/graph", ...options });
var listMemories = (options) => (options.client ?? client).get({ url: "/v1/default/banks/{bank_id}/memories/list", ...options });
var getMemory = (options) => (options.client ?? client).get({ url: "/v1/default/banks/{bank_id}/memories/{memory_id}", ...options });
var getObservationHistory = (options) => (options.client ?? client).get({
  url: "/v1/default/banks/{bank_id}/memories/{memory_id}/history",
  ...options
});
var recallMemories = (options) => (options.client ?? client).post({
  url: "/v1/default/banks/{bank_id}/memories/recall",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var reflect = (options) => (options.client ?? client).post({
  url: "/v1/default/banks/{bank_id}/reflect",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var listBanks = (options) => (options?.client ?? client).get({ url: "/v1/default/banks", ...options });
var getAgentStats = (options) => (options.client ?? client).get({ url: "/v1/default/banks/{bank_id}/stats", ...options });
var listEntities = (options) => (options.client ?? client).get({ url: "/v1/default/banks/{bank_id}/entities", ...options });
var getEntity = (options) => (options.client ?? client).get({ url: "/v1/default/banks/{bank_id}/entities/{entity_id}", ...options });
var regenerateEntityObservations = (options) => (options.client ?? client).post({
  url: "/v1/default/banks/{bank_id}/entities/{entity_id}/regenerate",
  ...options
});
var listMentalModels = (options) => (options.client ?? client).get({ url: "/v1/default/banks/{bank_id}/mental-models", ...options });
var createMentalModel = (options) => (options.client ?? client).post({
  url: "/v1/default/banks/{bank_id}/mental-models",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var deleteMentalModel = (options) => (options.client ?? client).delete({
  url: "/v1/default/banks/{bank_id}/mental-models/{mental_model_id}",
  ...options
});
var getMentalModel = (options) => (options.client ?? client).get({
  url: "/v1/default/banks/{bank_id}/mental-models/{mental_model_id}",
  ...options
});
var updateMentalModel = (options) => (options.client ?? client).patch({
  url: "/v1/default/banks/{bank_id}/mental-models/{mental_model_id}",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var getMentalModelHistory = (options) => (options.client ?? client).get({
  url: "/v1/default/banks/{bank_id}/mental-models/{mental_model_id}/history",
  ...options
});
var refreshMentalModel = (options) => (options.client ?? client).post({
  url: "/v1/default/banks/{bank_id}/mental-models/{mental_model_id}/refresh",
  ...options
});
var listDirectives = (options) => (options.client ?? client).get({ url: "/v1/default/banks/{bank_id}/directives", ...options });
var createDirective = (options) => (options.client ?? client).post({
  url: "/v1/default/banks/{bank_id}/directives",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var deleteDirective = (options) => (options.client ?? client).delete({
  url: "/v1/default/banks/{bank_id}/directives/{directive_id}",
  ...options
});
var getDirective = (options) => (options.client ?? client).get({
  url: "/v1/default/banks/{bank_id}/directives/{directive_id}",
  ...options
});
var updateDirective = (options) => (options.client ?? client).patch({
  url: "/v1/default/banks/{bank_id}/directives/{directive_id}",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var listDocuments = (options) => (options.client ?? client).get({ url: "/v1/default/banks/{bank_id}/documents", ...options });
var deleteDocument = (options) => (options.client ?? client).delete({ url: "/v1/default/banks/{bank_id}/documents/{document_id}", ...options });
var getDocument = (options) => (options.client ?? client).get({ url: "/v1/default/banks/{bank_id}/documents/{document_id}", ...options });
var updateDocument = (options) => (options.client ?? client).patch({
  url: "/v1/default/banks/{bank_id}/documents/{document_id}",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var listTags = (options) => (options.client ?? client).get({ url: "/v1/default/banks/{bank_id}/tags", ...options });
var getChunk = (options) => (options.client ?? client).get({ url: "/v1/default/chunks/{chunk_id}", ...options });
var listOperations = (options) => (options.client ?? client).get({ url: "/v1/default/banks/{bank_id}/operations", ...options });
var cancelOperation = (options) => (options.client ?? client).delete({
  url: "/v1/default/banks/{bank_id}/operations/{operation_id}",
  ...options
});
var getOperationStatus = (options) => (options.client ?? client).get({
  url: "/v1/default/banks/{bank_id}/operations/{operation_id}",
  ...options
});
var retryOperation = (options) => (options.client ?? client).post({
  url: "/v1/default/banks/{bank_id}/operations/{operation_id}/retry",
  ...options
});
var getBankProfile = (options) => (options.client ?? client).get({ url: "/v1/default/banks/{bank_id}/profile", ...options });
var updateBankDisposition = (options) => (options.client ?? client).put({
  url: "/v1/default/banks/{bank_id}/profile",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var addBankBackground = (options) => (options.client ?? client).post({
  url: "/v1/default/banks/{bank_id}/background",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var deleteBank = (options) => (options.client ?? client).delete({ url: "/v1/default/banks/{bank_id}", ...options });
var updateBank = (options) => (options.client ?? client).patch({
  url: "/v1/default/banks/{bank_id}",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var createOrUpdateBank = (options) => (options.client ?? client).put({
  url: "/v1/default/banks/{bank_id}",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var clearObservations = (options) => (options.client ?? client).delete({ url: "/v1/default/banks/{bank_id}/observations", ...options });
var recoverConsolidation = (options) => (options.client ?? client).post({ url: "/v1/default/banks/{bank_id}/consolidation/recover", ...options });
var clearMemoryObservations = (options) => (options.client ?? client).delete({
  url: "/v1/default/banks/{bank_id}/memories/{memory_id}/observations",
  ...options
});
var resetBankConfig = (options) => (options.client ?? client).delete({ url: "/v1/default/banks/{bank_id}/config", ...options });
var getBankConfig = (options) => (options.client ?? client).get({ url: "/v1/default/banks/{bank_id}/config", ...options });
var updateBankConfig = (options) => (options.client ?? client).patch({
  url: "/v1/default/banks/{bank_id}/config",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var triggerConsolidation = (options) => (options.client ?? client).post({ url: "/v1/default/banks/{bank_id}/consolidate", ...options });
var listWebhooks = (options) => (options.client ?? client).get({ url: "/v1/default/banks/{bank_id}/webhooks", ...options });
var createWebhook = (options) => (options.client ?? client).post({
  url: "/v1/default/banks/{bank_id}/webhooks",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var deleteWebhook = (options) => (options.client ?? client).delete({ url: "/v1/default/banks/{bank_id}/webhooks/{webhook_id}", ...options });
var updateWebhook = (options) => (options.client ?? client).patch({
  url: "/v1/default/banks/{bank_id}/webhooks/{webhook_id}",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var listWebhookDeliveries = (options) => (options.client ?? client).get({
  url: "/v1/default/banks/{bank_id}/webhooks/{webhook_id}/deliveries",
  ...options
});
var clearBankMemories = (options) => (options.client ?? client).delete({ url: "/v1/default/banks/{bank_id}/memories", ...options });
var retainMemories = (options) => (options.client ?? client).post({
  url: "/v1/default/banks/{bank_id}/memories",
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...options.headers
  }
});
var fileRetain = (options) => (options.client ?? client).post({
  ...formDataBodySerializer,
  url: "/v1/default/banks/{bank_id}/files/retain",
  ...options,
  headers: {
    "Content-Type": null,
    ...options.headers
  }
});
var listAuditLogs = (options) => (options.client ?? client).get({ url: "/v1/default/banks/{bank_id}/audit-logs", ...options });
var auditLogStats = (options) => (options.client ?? client).get({ url: "/v1/default/banks/{bank_id}/audit-logs/stats", ...options });
var HindsightError = class extends Error {
  constructor(message, statusCode, details) {
    super(message);
    this.name = "HindsightError";
    this.statusCode = statusCode;
    this.details = details;
  }
};
var HindsightClient = class {
  constructor(options) {
    this.client = createClient(
      createConfig({
        baseUrl: options.baseUrl,
        headers: options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : void 0
      })
    );
  }
  /**
   * Validates the API response and throws an error if the request failed.
   */
  validateResponse(response, operation) {
    if (!response.data) {
      const error = response.error;
      const httpResponse = response.response;
      const statusCode = httpResponse?.status;
      const details = error?.detail || error?.message || error;
      throw new HindsightError(
        `${operation} failed: ${JSON.stringify(details)}`,
        statusCode,
        details
      );
    }
    return response.data;
  }
  /**
   * Retain a single memory for a bank.
   */
  async retain(bankId, content, options) {
    const item = { content };
    if (options?.timestamp) {
      item.timestamp = options.timestamp instanceof Date ? options.timestamp.toISOString() : options.timestamp;
    }
    if (options?.context) {
      item.context = options.context;
    }
    if (options?.metadata) {
      item.metadata = options.metadata;
    }
    if (options?.documentId) {
      item.document_id = options.documentId;
    }
    if (options?.entities) {
      item.entities = options.entities;
    }
    if (options?.tags) {
      item.tags = options.tags;
    }
    const response = await retainMemories({
      client: this.client,
      path: { bank_id: bankId },
      body: { items: [item], async: options?.async }
    });
    return this.validateResponse(response, "retain");
  }
  /**
   * Retain multiple memories in batch.
   */
  async retainBatch(bankId, items, options) {
    const processedItems = items.map((item) => ({
      content: item.content,
      context: item.context,
      metadata: item.metadata,
      document_id: item.document_id,
      entities: item.entities,
      tags: item.tags,
      observation_scopes: item.observation_scopes,
      strategy: item.strategy,
      timestamp: item.timestamp instanceof Date ? item.timestamp.toISOString() : item.timestamp
    }));
    const itemsWithDocId = processedItems.map((item) => ({
      ...item,
      document_id: item.document_id || options?.documentId
    }));
    const response = await retainMemories({
      client: this.client,
      path: { bank_id: bankId },
      body: {
        items: itemsWithDocId,
        document_tags: options?.documentTags,
        async: options?.async
      }
    });
    return this.validateResponse(response, "retainBatch");
  }
  /**
   * Upload files and retain their contents as memories.
   *
   * Files are automatically converted to text (PDF, DOCX, images via OCR, audio via
   * transcription, and more) and ingested as memories. Processing is always asynchronous —
   * use the returned operation IDs to track progress via the operations endpoint.
   *
   * @param bankId - The memory bank ID
   * @param files - Array of File or Blob objects to upload
   * @param options - Optional settings: context, documentTags, filesMetadata
   */
  async retainFiles(bankId, files, options) {
    const meta = options?.filesMetadata ?? files.map(() => options?.context ? { context: options.context } : {});
    const requestBody = JSON.stringify({
      files_metadata: meta
    });
    const response = await fileRetain({
      client: this.client,
      path: { bank_id: bankId },
      body: { files, request: requestBody }
    });
    return this.validateResponse(response, "retainFiles");
  }
  /**
   * Recall memories with a natural language query.
   */
  async recall(bankId, query, options) {
    const response = await recallMemories({
      client: this.client,
      path: { bank_id: bankId },
      body: {
        query,
        types: options?.types,
        max_tokens: options?.maxTokens,
        budget: options?.budget || "mid",
        trace: options?.trace,
        query_timestamp: options?.queryTimestamp,
        include: {
          entities: options?.includeEntities === false ? null : options?.includeEntities ? { max_tokens: options?.maxEntityTokens ?? 500 } : void 0,
          chunks: options?.includeChunks ? { max_tokens: options?.maxChunkTokens ?? 8192 } : void 0,
          source_facts: options?.includeSourceFacts ? { max_tokens: options?.maxSourceFactsTokens ?? 4096 } : void 0
        },
        tags: options?.tags,
        tags_match: options?.tagsMatch
      }
    });
    return this.validateResponse(response, "recall");
  }
  /**
   * Reflect and generate a contextual answer using the bank's identity and memories.
   */
  async reflect(bankId, query, options) {
    const response = await reflect({
      client: this.client,
      path: { bank_id: bankId },
      body: {
        query,
        context: options?.context,
        budget: options?.budget || "low",
        tags: options?.tags,
        tags_match: options?.tagsMatch
      }
    });
    return this.validateResponse(response, "reflect");
  }
  /**
   * List memories with pagination.
   */
  async listMemories(bankId, options) {
    const response = await listMemories({
      client: this.client,
      path: { bank_id: bankId },
      query: {
        limit: options?.limit,
        offset: options?.offset,
        type: options?.type,
        q: options?.q
      }
    });
    return this.validateResponse(response, "listMemories");
  }
  /**
   * Create or update a bank with disposition, missions, and operational configuration.
   */
  async createBank(bankId, options = {}) {
    const response = await createOrUpdateBank({
      client: this.client,
      path: { bank_id: bankId },
      body: {
        name: options.name,
        mission: options.mission,
        reflect_mission: options.reflectMission,
        background: options.background,
        disposition: options.disposition,
        disposition_skepticism: options.dispositionSkepticism,
        disposition_literalism: options.dispositionLiteralism,
        disposition_empathy: options.dispositionEmpathy,
        retain_mission: options.retainMission,
        retain_extraction_mode: options.retainExtractionMode,
        retain_custom_instructions: options.retainCustomInstructions,
        retain_chunk_size: options.retainChunkSize,
        enable_observations: options.enableObservations,
        observations_mission: options.observationsMission
      }
    });
    return this.validateResponse(response, "createBank");
  }
  /**
   * Set or update the reflect mission for a memory bank.
   * @deprecated Use createBank({ reflectMission: '...' }) instead.
   */
  async setMission(bankId, mission) {
    return this.createBank(bankId, { reflectMission: mission });
  }
  /**
   * Get a bank's profile.
   */
  async getBankProfile(bankId) {
    const response = await getBankProfile({
      client: this.client,
      path: { bank_id: bankId }
    });
    return this.validateResponse(response, "getBankProfile");
  }
  /**
   * Get the resolved configuration for a bank, including any bank-level overrides.
   *
   * Can be disabled on the server by setting `HINDSIGHT_API_ENABLE_BANK_CONFIG_API=false`.
   */
  async getBankConfig(bankId) {
    const response = await getBankConfig({
      client: this.client,
      path: { bank_id: bankId }
    });
    return this.validateResponse(response, "getBankConfig");
  }
  /**
   * Update configuration overrides for a bank.
   *
   * Can be disabled on the server by setting `HINDSIGHT_API_ENABLE_BANK_CONFIG_API=false`.
   *
   * @param bankId - The memory bank ID
   * @param options - Fields to override
   */
  async updateBankConfig(bankId, options) {
    const updates = {};
    if (options.reflectMission !== void 0) updates.reflect_mission = options.reflectMission;
    if (options.retainMission !== void 0) updates.retain_mission = options.retainMission;
    if (options.retainExtractionMode !== void 0) updates.retain_extraction_mode = options.retainExtractionMode;
    if (options.retainCustomInstructions !== void 0)
      updates.retain_custom_instructions = options.retainCustomInstructions;
    if (options.retainChunkSize !== void 0) updates.retain_chunk_size = options.retainChunkSize;
    if (options.enableObservations !== void 0) updates.enable_observations = options.enableObservations;
    if (options.observationsMission !== void 0) updates.observations_mission = options.observationsMission;
    if (options.dispositionSkepticism !== void 0) updates.disposition_skepticism = options.dispositionSkepticism;
    if (options.dispositionLiteralism !== void 0) updates.disposition_literalism = options.dispositionLiteralism;
    if (options.dispositionEmpathy !== void 0) updates.disposition_empathy = options.dispositionEmpathy;
    const response = await updateBankConfig({
      client: this.client,
      path: { bank_id: bankId },
      body: { updates }
    });
    return this.validateResponse(response, "updateBankConfig");
  }
  /**
   * Reset all bank-level configuration overrides, reverting to server defaults.
   *
   * Can be disabled on the server by setting `HINDSIGHT_API_ENABLE_BANK_CONFIG_API=false`.
   */
  async resetBankConfig(bankId) {
    const response = await resetBankConfig({
      client: this.client,
      path: { bank_id: bankId }
    });
    return this.validateResponse(response, "resetBankConfig");
  }
  /**
   * Delete a bank.
   */
  async deleteBank(bankId) {
    const response = await deleteBank({
      client: this.client,
      path: { bank_id: bankId }
    });
    if (response.error) {
      throw new Error(`deleteBank failed: ${JSON.stringify(response.error)}`);
    }
  }
  // Directive methods
  /**
   * Create a directive (hard rule for reflect).
   */
  async createDirective(bankId, name, content, options) {
    const response = await createDirective({
      client: this.client,
      path: { bank_id: bankId },
      body: {
        name,
        content,
        priority: options?.priority ?? 0,
        is_active: options?.isActive ?? true,
        tags: options?.tags
      }
    });
    return this.validateResponse(response, "createDirective");
  }
  /**
   * List all directives in a bank.
   */
  async listDirectives(bankId, options) {
    const response = await listDirectives({
      client: this.client,
      path: { bank_id: bankId },
      query: { tags: options?.tags }
    });
    return this.validateResponse(response, "listDirectives");
  }
  /**
   * Get a specific directive.
   */
  async getDirective(bankId, directiveId) {
    const response = await getDirective({
      client: this.client,
      path: { bank_id: bankId, directive_id: directiveId }
    });
    return this.validateResponse(response, "getDirective");
  }
  /**
   * Update a directive.
   */
  async updateDirective(bankId, directiveId, options) {
    const response = await updateDirective({
      client: this.client,
      path: { bank_id: bankId, directive_id: directiveId },
      body: {
        name: options.name,
        content: options.content,
        priority: options.priority,
        is_active: options.isActive,
        tags: options.tags
      }
    });
    return this.validateResponse(response, "updateDirective");
  }
  /**
   * Delete a directive.
   */
  async deleteDirective(bankId, directiveId) {
    const response = await deleteDirective({
      client: this.client,
      path: { bank_id: bankId, directive_id: directiveId }
    });
    if (response.error) {
      throw new Error(`deleteDirective failed: ${JSON.stringify(response.error)}`);
    }
  }
  // Mental Model methods
  /**
   * Create a mental model (runs reflect in background).
   */
  async createMentalModel(bankId, name, sourceQuery, options) {
    const response = await createMentalModel({
      client: this.client,
      path: { bank_id: bankId },
      body: {
        id: options?.id,
        name,
        source_query: sourceQuery,
        tags: options?.tags,
        max_tokens: options?.maxTokens,
        trigger: options?.trigger ? { refresh_after_consolidation: options.trigger.refreshAfterConsolidation } : void 0
      }
    });
    return this.validateResponse(response, "createMentalModel");
  }
  /**
   * List all mental models in a bank.
   */
  async listMentalModels(bankId, options) {
    const response = await listMentalModels({
      client: this.client,
      path: { bank_id: bankId },
      query: { tags: options?.tags }
    });
    return this.validateResponse(response, "listMentalModels");
  }
  /**
   * Get a specific mental model.
   */
  async getMentalModel(bankId, mentalModelId) {
    const response = await getMentalModel({
      client: this.client,
      path: { bank_id: bankId, mental_model_id: mentalModelId }
    });
    return this.validateResponse(response, "getMentalModel");
  }
  /**
   * Refresh a mental model to update with current knowledge.
   */
  async refreshMentalModel(bankId, mentalModelId) {
    const response = await refreshMentalModel({
      client: this.client,
      path: { bank_id: bankId, mental_model_id: mentalModelId }
    });
    return this.validateResponse(response, "refreshMentalModel");
  }
  /**
   * Update a mental model's metadata.
   */
  async updateMentalModel(bankId, mentalModelId, options) {
    const response = await updateMentalModel({
      client: this.client,
      path: { bank_id: bankId, mental_model_id: mentalModelId },
      body: {
        name: options.name,
        source_query: options.sourceQuery,
        tags: options.tags,
        max_tokens: options.maxTokens,
        trigger: options.trigger ? { refresh_after_consolidation: options.trigger.refreshAfterConsolidation } : void 0
      }
    });
    return this.validateResponse(response, "updateMentalModel");
  }
  /**
   * Delete a mental model.
   */
  async deleteMentalModel(bankId, mentalModelId) {
    const response = await deleteMentalModel({
      client: this.client,
      path: { bank_id: bankId, mental_model_id: mentalModelId }
    });
    if (response.error) {
      throw new Error(`deleteMentalModel failed: ${JSON.stringify(response.error)}`);
    }
  }
  /**
   * Get the change history of a mental model.
   */
  async getMentalModelHistory(bankId, mentalModelId) {
    const response = await getMentalModelHistory({
      client: this.client,
      path: { bank_id: bankId, mental_model_id: mentalModelId }
    });
    return this.validateResponse(response, "getMentalModelHistory");
  }
};

// src/config.ts
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
var DEFAULT_HINDSIGHT_API_URL = "https://api.hindsight.vectorize.io";
var DEFAULTS = {
  // Recall
  autoRecall: true,
  recallBudget: "mid",
  recallMaxTokens: 1024,
  recallTypes: ["world", "experience"],
  recallContextTurns: 1,
  recallMaxQueryChars: 800,
  recallTags: [],
  recallTagsMatch: "any",
  recallPromptPreamble: "Relevant memories from past conversations (prioritize recent when conflicting). Only use memories that are directly useful to continue this conversation; ignore the rest:",
  // Retain
  autoRetain: true,
  retainMode: "full-session",
  retainEveryNTurns: 3,
  retainOverlapTurns: 2,
  retainContext: "opencode",
  retainTags: [],
  retainMetadata: {},
  // Connection
  hindsightApiUrl: DEFAULT_HINDSIGHT_API_URL,
  hindsightApiToken: null,
  // Bank
  bankId: null,
  bankIdPrefix: "",
  dynamicBankId: false,
  dynamicBankGranularity: ["agent", "project"],
  bankMission: "",
  retainMission: null,
  agentName: "opencode",
  // Misc
  debug: false
};
var ENV_OVERRIDES = {
  HINDSIGHT_API_URL: ["hindsightApiUrl", "string"],
  HINDSIGHT_API_TOKEN: ["hindsightApiToken", "string"],
  HINDSIGHT_BANK_ID: ["bankId", "string"],
  HINDSIGHT_AGENT_NAME: ["agentName", "string"],
  HINDSIGHT_AUTO_RECALL: ["autoRecall", "bool"],
  HINDSIGHT_AUTO_RETAIN: ["autoRetain", "bool"],
  HINDSIGHT_RETAIN_MODE: ["retainMode", "string"],
  HINDSIGHT_RECALL_BUDGET: ["recallBudget", "string"],
  HINDSIGHT_RECALL_MAX_TOKENS: ["recallMaxTokens", "int"],
  HINDSIGHT_RECALL_MAX_QUERY_CHARS: ["recallMaxQueryChars", "int"],
  HINDSIGHT_RECALL_CONTEXT_TURNS: ["recallContextTurns", "int"],
  HINDSIGHT_DYNAMIC_BANK_ID: ["dynamicBankId", "bool"],
  HINDSIGHT_BANK_MISSION: ["bankMission", "string"],
  HINDSIGHT_BANK_ID_PREFIX: ["bankIdPrefix", "string"],
  HINDSIGHT_RETAIN_EVERY_N_TURNS: ["retainEveryNTurns", "int"],
  HINDSIGHT_RETAIN_OVERLAP_TURNS: ["retainOverlapTurns", "int"],
  HINDSIGHT_RECALL_TAGS: ["recallTags", "string"],
  HINDSIGHT_RETAIN_TAGS: ["retainTags", "string"],
  HINDSIGHT_RECALL_TAGS_MATCH: ["recallTagsMatch", "string"],
  HINDSIGHT_RECALL_PROMPT_PREAMBLE: ["recallPromptPreamble", "string"],
  HINDSIGHT_RETAIN_CONTEXT: ["retainContext", "string"]
  // NOTE: `debug` is intentionally NOT an env override. It is a proper config
  // option set via opencode.json plugin options or ~/.hindsight/opencode.json,
  // because env vars are unreliable to set for OpenCode's plugin runtime
  // (notably on Windows).
};
function castEnv(value, typ) {
  if (typ === "bool") return ["true", "1", "yes"].includes(value.toLowerCase());
  if (typ === "int") {
    const n = parseInt(value, 10);
    return isNaN(n) ? null : n;
  }
  return value;
}
function loadSettingsFile(path) {
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
function loadConfig(pluginOptions) {
  const config = { ...DEFAULTS };
  const userConfigPath = join(homedir(), ".hindsight", "opencode.json");
  const fileConfig = loadSettingsFile(userConfigPath);
  for (const [key, value] of Object.entries(fileConfig)) {
    if (value !== null && value !== void 0) {
      config[key] = value;
    }
  }
  if (pluginOptions) {
    for (const [key, value] of Object.entries(pluginOptions)) {
      if (value !== null && value !== void 0) {
        config[key] = value;
      }
    }
  }
  for (const [envName, [key, typ]] of Object.entries(ENV_OVERRIDES)) {
    const val = process.env[envName];
    if (val !== void 0) {
      const castVal = castEnv(val, typ);
      if (castVal !== null) {
        config[key] = castVal;
      }
    }
  }
  const recallTagsEnv = process.env["HINDSIGHT_RECALL_TAGS"];
  if (recallTagsEnv !== void 0) {
    config["recallTags"] = recallTagsEnv.split(",").map((t) => t.trim()).filter(Boolean);
  }
  const recallTagsMatchEnv = process.env["HINDSIGHT_RECALL_TAGS_MATCH"];
  if (recallTagsMatchEnv !== void 0) {
    config["recallTagsMatch"] = recallTagsMatchEnv;
  }
  const retainTagsEnv = process.env["HINDSIGHT_RETAIN_TAGS"];
  if (retainTagsEnv !== void 0) {
    config["retainTags"] = retainTagsEnv.split(",").map((t) => t.trim()).filter(Boolean);
  }
  const result = config;
  const VALID_RETAIN_MODES = ["full-session", "last-turn"];
  if (!VALID_RETAIN_MODES.includes(result.retainMode)) {
    console.error(
      `[Hindsight] Unknown retainMode "${result.retainMode}" \u2014 valid: ${VALID_RETAIN_MODES.join(", ")}. Falling back to "full-session".`
    );
    result.retainMode = "full-session";
  }
  const VALID_TAGS_MATCH = ["any", "all", "any_strict", "all_strict"];
  if (!VALID_TAGS_MATCH.includes(result.recallTagsMatch)) {
    console.error(
      `[Hindsight] Unknown recallTagsMatch "${result.recallTagsMatch}" \u2014 valid: ${VALID_TAGS_MATCH.join(", ")}. Falling back to "any".`
    );
    result.recallTagsMatch = "any";
  }
  const VALID_BUDGETS = ["low", "mid", "high"];
  if (!VALID_BUDGETS.includes(result.recallBudget)) {
    console.error(
      `[Hindsight] Unknown recallBudget "${result.recallBudget}" \u2014 valid: ${VALID_BUDGETS.join(", ")}. Falling back to "mid".`
    );
    result.recallBudget = "mid";
  }
  return result;
}
function liveConfig(base) {
  const out = { ...base };
  for (const [envName, [key, typ]] of Object.entries(ENV_OVERRIDES)) {
    const v = process.env[envName];
    if (v !== void 0) {
      const cv = castEnv(v, typ);
      if (cv !== null) {
        out[key] = cv;
      }
    }
  }
  const recallTagsEnv = process.env["HINDSIGHT_RECALL_TAGS"];
  if (recallTagsEnv !== void 0) {
    out.recallTags = recallTagsEnv.split(",").map((t) => t.trim()).filter(Boolean);
  }
  const recallTagsMatchEnv = process.env["HINDSIGHT_RECALL_TAGS_MATCH"];
  if (recallTagsMatchEnv !== void 0) {
    out.recallTagsMatch = recallTagsMatchEnv;
  }
  const retainTagsEnv = process.env["HINDSIGHT_RETAIN_TAGS"];
  if (retainTagsEnv !== void 0) {
    out.retainTags = retainTagsEnv.split(",").map((t) => t.trim()).filter(Boolean);
  }
  return out;
}

// src/bank.ts
import { basename, dirname } from "path";
import { execFileSync } from "child_process";

// src/logger.ts
var SERVICE = "hindsight";
var Logger = class {
  client;
  debugEnabled;
  silent;
  constructor(options = {}) {
    this.client = options.client;
    this.debugEnabled = options.debug ?? false;
    this.silent = options.silent ?? false;
  }
  emit(level, message, extra) {
    if (this.silent) return;
    const app = this.client?.app;
    if (app && typeof app.log === "function") {
      try {
        const result = app.log({ body: { service: SERVICE, level, message, extra } });
        if (result && typeof result.then === "function") {
          result.then(void 0, () => {
          });
        }
        return;
      } catch {
      }
    }
    const line = extra ? `[Hindsight] ${message} ${JSON.stringify(extra)}` : `[Hindsight] ${message}`;
    console.error(line);
  }
  error(message, error) {
    this.emit("error", message, error === void 0 ? void 0 : { error: errorToString(error) });
  }
  warn(message, extra) {
    this.emit("warn", message, extra);
  }
  info(message, extra) {
    this.emit("info", message, extra);
  }
  debug(message, extra) {
    if (this.debugEnabled) this.emit("debug", message, extra);
  }
};
function errorToString(error) {
  if (error instanceof Error) return error.stack || `${error.name}: ${error.message}`;
  return String(error);
}

// src/bank.ts
var DEFAULT_BANK_NAME = "opencode";
var VALID_FIELDS = /* @__PURE__ */ new Set(["agent", "project", "gitProject", "channel", "user"]);
function getProjectRootFromGit(directory) {
  if (!directory) return null;
  try {
    const commonDir = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      {
        cwd: directory,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 1e3
      }
    ).trim();
    if (!commonDir) return null;
    if (basename(commonDir) === ".git") {
      return dirname(commonDir);
    }
    return commonDir;
  } catch {
    return null;
  }
}
function deriveGitProjectName(directory) {
  const projectRoot = getProjectRootFromGit(directory);
  if (projectRoot) return basename(projectRoot);
  return directory ? basename(directory) : "unknown";
}
function deriveBankId(config, directory) {
  const prefix = config.bankIdPrefix;
  if (!config.dynamicBankId) {
    const base = config.bankId || DEFAULT_BANK_NAME;
    return prefix ? `${prefix}-${base}` : base;
  }
  const fields = config.dynamicBankGranularity?.length ? config.dynamicBankGranularity : ["agent", "project"];
  for (const f of fields) {
    if (!VALID_FIELDS.has(f)) {
      console.error(
        `[Hindsight] Unknown dynamicBankGranularity field "${f}" \u2014 valid: ${[...VALID_FIELDS].sort().join(", ")}`
      );
    }
  }
  const channelId = process.env.HINDSIGHT_CHANNEL_ID || "";
  const userId = process.env.HINDSIGHT_USER_ID || "";
  const fieldResolvers = {
    agent: () => config.agentName || "opencode",
    project: () => directory ? basename(directory) : "unknown",
    gitProject: () => deriveGitProjectName(directory),
    channel: () => channelId || "default",
    user: () => userId || "anonymous"
  };
  const segments = fields.map((f) => fieldResolvers[f]?.() || "unknown");
  const baseBankId = segments.join("::");
  return prefix ? `${prefix}-${baseBankId}` : baseBankId;
}
async function ensureBankMission(client2, bankId, config, missionsSet, logger = new Logger({ silent: true })) {
  const mission = config.bankMission;
  if (!mission?.trim()) return;
  if (missionsSet.has(bankId)) return;
  try {
    await client2.createBank(bankId, {
      reflectMission: mission,
      retainMission: config.retainMission || void 0
    });
    missionsSet.add(bankId);
    if (missionsSet.size > 1e4) {
      const keys = [...missionsSet].sort();
      for (const k of keys.slice(0, keys.length >> 1)) {
        missionsSet.delete(k);
      }
    }
    logger.debug(`Set mission for bank: ${bankId}`);
  } catch (e) {
    logger.debug(`Could not set bank mission for ${bankId}`, { error: String(e) });
  }
}

// src/tools.ts
import { tool } from "@opencode-ai/plugin/tool";

// src/content.ts
function stripMemoryTags(content) {
  content = content.replace(/<hindsight_memories>[\s\S]*?<\/hindsight_memories>/g, "");
  content = content.replace(/<relevant_memories>[\s\S]*?<\/relevant_memories>/g, "");
  return content;
}
function formatMemories(results) {
  if (!results.length) return "";
  return results.map((r) => {
    const typeStr = r.type ? ` [${r.type}]` : "";
    const dateStr = r.mentioned_at ? ` (${r.mentioned_at})` : "";
    return `- ${r.text}${typeStr}${dateStr}`;
  }).join("\n\n");
}
function formatCurrentTime() {
  const now = /* @__PURE__ */ new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}`;
}
function composeRecallQuery(latestQuery, messages, recallContextTurns) {
  const latest = latestQuery.trim();
  if (recallContextTurns <= 1 || !messages.length) return latest;
  const contextual = sliceLastTurnsByUserBoundary(messages, recallContextTurns);
  const contextLines = [];
  for (const msg of contextual) {
    const content = stripMemoryTags(msg.content).trim();
    if (!content) continue;
    if (msg.role === "user" && content === latest) continue;
    contextLines.push(`${msg.role}: ${content}`);
  }
  if (!contextLines.length) return latest;
  return ["Prior context:", contextLines.join("\n"), latest].join("\n\n");
}
function truncateRecallQuery(query, latestQuery, maxChars) {
  if (maxChars <= 0 || query.length <= maxChars) return query;
  const latest = latestQuery.trim();
  const latestOnly = latest.length > maxChars ? latest.slice(0, maxChars) : latest;
  if (!query.includes("Prior context:")) return latestOnly;
  const contextMarker = "Prior context:\n\n";
  const markerIndex = query.indexOf(contextMarker);
  if (markerIndex === -1) return latestOnly;
  const suffix = "\n\n" + latest;
  const suffixIndex = query.lastIndexOf(suffix);
  if (suffixIndex === -1) return latestOnly;
  if (suffix.length >= maxChars) return latestOnly;
  const contextBody = query.slice(markerIndex + contextMarker.length, suffixIndex);
  const contextLines = contextBody.split("\n").filter(Boolean);
  const kept = [];
  for (let i = contextLines.length - 1; i >= 0; i--) {
    kept.unshift(contextLines[i]);
    const candidate = `${contextMarker}${kept.join("\n")}${suffix}`;
    if (candidate.length > maxChars) {
      kept.shift();
      break;
    }
  }
  if (kept.length) return `${contextMarker}${kept.join("\n")}${suffix}`;
  return latestOnly;
}
function sliceLastTurnsByUserBoundary(messages, turns) {
  if (!messages.length || turns <= 0) return [];
  let userTurnsSeen = 0;
  let startIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      userTurnsSeen++;
      if (userTurnsSeen >= turns) {
        startIndex = i;
        break;
      }
    }
  }
  return startIndex === -1 ? [...messages] : messages.slice(startIndex);
}
function prepareRetentionTranscript(messages, retainFullWindow = false) {
  if (!messages.length) return { transcript: null, messageCount: 0 };
  let targetMessages;
  if (retainFullWindow) {
    targetMessages = messages;
  } else {
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return { transcript: null, messageCount: 0 };
    targetMessages = messages.slice(lastUserIdx);
  }
  const parts = [];
  for (const msg of targetMessages) {
    const content = stripMemoryTags(msg.content).trim();
    if (!content) continue;
    parts.push(`[role: ${msg.role}]
${content}
[${msg.role}:end]`);
  }
  if (!parts.length) return { transcript: null, messageCount: 0 };
  const transcript = parts.join("\n\n");
  if (transcript.trim().length < 10) return { transcript: null, messageCount: 0 };
  return { transcript, messageCount: parts.length };
}

// src/tools.ts
function createTools(client2, bankId, config, missionsSet, logger = new Logger({ silent: true })) {
  const hindsight_retain = tool({
    description: "Store information in long-term memory. Use this to remember important facts, user preferences, project context, decisions, and anything worth recalling in future sessions. Be specific \u2014 include who, what, when, and why.",
    args: {
      content: tool.schema.string().describe("The information to remember. Be specific and self-contained."),
      context: tool.schema.string().optional().describe("Optional context about where this information came from."),
      tags: tool.schema.array(tool.schema.string()).optional().describe(
        "Tags to attach to this memory. Overrides config retainTags for this call. Use ['scope:user'] for cross-project user-level memories, ['project:<name>'] for project-scoped memories."
      )
    },
    async execute(args) {
      const cfg = liveConfig(config);
      if (missionsSet) {
        await ensureBankMission(client2, bankId, cfg, missionsSet, logger);
      }
      await client2.retain(bankId, args.content, {
        context: args.context || cfg.retainContext,
        tags: args.tags !== void 0 ? args.tags : cfg.retainTags.length ? cfg.retainTags : void 0,
        metadata: Object.keys(cfg.retainMetadata).length ? cfg.retainMetadata : void 0
      });
      return "Memory stored successfully.";
    }
  });
  const hindsight_recall = tool({
    description: "Search long-term memory for relevant information. Use this proactively before answering questions about past conversations, user preferences, project history, or any topic where prior context would help. When in doubt, recall first.",
    args: {
      query: tool.schema.string().describe("Natural language search query. Be specific about what you need to know."),
      tags: tool.schema.array(tool.schema.string()).optional().describe(
        "Tags to filter by. Overrides config recallTags for this call. Use ['scope:user'] for user-level memories, ['project:<name>'] for project-scoped."
      ),
      tagsMatch: tool.schema.string().optional().describe(
        "Tag match mode: 'any', 'all', 'any_strict', 'all_strict'. Defaults to 'any_strict' when tags arg is provided. Ignored if tags arg is omitted."
      )
    },
    async execute(args) {
      const cfg = liveConfig(config);
      const recallTags = args.tags !== void 0 ? args.tags : cfg.recallTags.length ? cfg.recallTags : [];
      const recallTagsMatch = args.tags !== void 0 ? args.tagsMatch || "any_strict" : cfg.recallTags.length ? cfg.recallTagsMatch : void 0;
      const response = await client2.recall(bankId, args.query, {
        budget: cfg.recallBudget,
        maxTokens: cfg.recallMaxTokens,
        types: cfg.recallTypes,
        tags: recallTags.length ? recallTags : void 0,
        tagsMatch: recallTagsMatch
      });
      const results = response.results || [];
      if (!results.length) return "No relevant memories found.";
      const formatted = formatMemories(results);
      return `Found ${results.length} relevant memories (as of ${formatCurrentTime()} UTC):

${formatted}`;
    }
  });
  const hindsight_reflect = tool({
    description: 'Generate a thoughtful answer using long-term memory. Unlike recall (which returns raw memories), reflect synthesizes memories into a coherent answer. Use for questions like "What do you know about this user?" or "Summarize our project decisions."',
    args: {
      query: tool.schema.string().describe("The question to answer using long-term memory."),
      context: tool.schema.string().optional().describe("Optional additional context to guide the reflection."),
      tags: tool.schema.array(tool.schema.string()).optional().describe(
        "Tags to filter by. Overrides config recallTags for this call. Use ['scope:user'] for user-level memories, ['project:<name>'] for project-scoped."
      ),
      tagsMatch: tool.schema.string().optional().describe(
        "Tag match mode: 'any', 'all', 'any_strict', 'all_strict'. Defaults to 'any_strict' when tags arg is provided. Ignored if tags arg is omitted."
      )
    },
    async execute(args) {
      const cfg = liveConfig(config);
      if (missionsSet) {
        await ensureBankMission(client2, bankId, cfg, missionsSet, logger);
      }
      const reflectTags = args.tags !== void 0 ? args.tags : cfg.recallTags.length ? cfg.recallTags : [];
      const reflectTagsMatch = args.tags !== void 0 ? args.tagsMatch || "any_strict" : cfg.recallTags.length ? cfg.recallTagsMatch : void 0;
      const response = await client2.reflect(bankId, args.query, {
        context: args.context,
        budget: cfg.recallBudget,
        tags: reflectTags.length ? reflectTags : void 0,
        tagsMatch: reflectTagsMatch
      });
      return response.text || "No relevant information found to reflect on.";
    }
  });
  return { hindsight_retain, hindsight_recall, hindsight_reflect };
}

// src/hooks.ts
function createHooks(hindsightClient, bankId, config, state2, opencodeClient, logger = new Logger({ silent: true })) {
  async function recallForContext(query) {
    try {
      const cfg = liveConfig(config);
      const response = await hindsightClient.recall(bankId, query, {
        budget: cfg.recallBudget,
        maxTokens: cfg.recallMaxTokens,
        types: cfg.recallTypes,
        tags: cfg.recallTags.length ? cfg.recallTags : void 0,
        tagsMatch: cfg.recallTags.length ? cfg.recallTagsMatch : void 0
      });
      const results = response.results || [];
      if (!results.length) return { context: null, ok: true };
      const formatted = formatMemories(results);
      const context = `<hindsight_memories>
${cfg.recallPromptPreamble}
Current time: ${formatCurrentTime()} UTC

${formatted}
</hindsight_memories>`;
      return { context, ok: true };
    } catch (e) {
      logger.error("Recall failed", e);
      return { context: null, ok: false };
    }
  }
  async function getSessionMessages(sessionId) {
    try {
      logger.debug(`getSessionMessages: fetching messages for session ${sessionId}`);
      const response = await opencodeClient.session.messages({
        path: { id: sessionId }
      });
      if (response.error) {
        logger.warn("getSessionMessages: OpenCode returned an error", {
          error: JSON.stringify(response.error)?.substring(0, 500)
        });
      }
      const rawMessages = response.data || [];
      const messages = [];
      for (const msg of rawMessages) {
        const role = msg.info.role;
        if (role !== "user" && role !== "assistant") continue;
        const textParts = msg.parts.filter((p) => p.type === "text" && p.text).map((p) => p.text);
        if (textParts.length) {
          messages.push({ role, content: textParts.join("\n") });
        }
      }
      logger.debug(`getSessionMessages: raw=${rawMessages.length}, parsed=${messages.length}`);
      return messages;
    } catch (e) {
      logger.error("Failed to get session messages", e);
      return [];
    }
  }
  async function retainSession(sessionId, messages) {
    const retainFullWindow = config.retainMode === "full-session";
    let targetMessages;
    let documentId;
    if (retainFullWindow) {
      targetMessages = messages;
      documentId = sessionId;
    } else {
      const windowTurns = config.retainEveryNTurns + config.retainOverlapTurns;
      targetMessages = sliceLastTurnsByUserBoundary(messages, windowTurns);
      documentId = `${sessionId}-${Date.now()}`;
    }
    const { transcript } = prepareRetentionTranscript(targetMessages, true);
    if (!transcript) return;
    const cfg = liveConfig(config);
    await ensureBankMission(hindsightClient, bankId, cfg, state2.missionsSet, logger);
    await hindsightClient.retain(bankId, transcript, {
      documentId,
      context: cfg.retainContext,
      tags: cfg.retainTags.length ? cfg.retainTags : void 0,
      metadata: Object.keys(cfg.retainMetadata).length ? { ...cfg.retainMetadata, session_id: sessionId } : { session_id: sessionId },
      async: true
    });
  }
  async function handleSessionIdle(sessionId) {
    logger.debug(`handleSessionIdle called for session ${sessionId}`);
    if (!config.autoRetain) return;
    const messages = await getSessionMessages(sessionId);
    if (!messages.length) return;
    const userTurns = messages.filter((m) => m.role === "user").length;
    const lastRetained = state2.lastRetainedTurn.get(sessionId) || 0;
    logger.debug(
      `handleSessionIdle: userTurns=${userTurns}, lastRetained=${lastRetained}, retainEveryNTurns=${config.retainEveryNTurns}`
    );
    if (userTurns - lastRetained < config.retainEveryNTurns) return;
    try {
      await retainSession(sessionId, messages);
      state2.lastRetainedTurn.set(sessionId, userTurns);
      logger.info(`Auto-retained ${messages.length} messages`, {
        session: sessionId,
        bank: bankId
      });
    } catch (e) {
      logger.error("Auto-retain failed", e);
    }
  }
  const event = async (input) => {
    try {
      const { event: evt } = input;
      logger.debug(`event hook fired: type=${evt.type}`);
      if (evt.type === "session.idle") {
        const sessionId = evt.properties.sessionID;
        if (sessionId) {
          await handleSessionIdle(sessionId);
        }
      }
    } catch (e) {
      logger.error("Event hook error", e);
    }
  };
  const compacting = async (input, output) => {
    try {
      const messages = await getSessionMessages(input.sessionID);
      if (messages.length && config.autoRetain) {
        try {
          await retainSession(input.sessionID, messages);
          state2.lastRetainedTurn.delete(input.sessionID);
          logger.debug("Pre-compaction retain completed");
        } catch (e) {
          logger.error("Pre-compaction retain failed", e);
        }
      }
      if (messages.length) {
        const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
        if (lastUserMsg) {
          const query = composeRecallQuery(
            lastUserMsg.content,
            messages,
            config.recallContextTurns
          );
          const truncated = truncateRecallQuery(
            query,
            lastUserMsg.content,
            config.recallMaxQueryChars
          );
          const { context } = await recallForContext(truncated);
          if (context) {
            output.context.push(context);
          }
        }
      }
    } catch (e) {
      logger.error("Compaction hook error", e);
    }
  };
  const systemTransform = async (input, output) => {
    try {
      if (!config.autoRecall) return;
      const sessionId = input.sessionID;
      if (!sessionId) return;
      if (state2.recalledSessions.has(sessionId)) return;
      await ensureBankMission(hindsightClient, bankId, config, state2.missionsSet, logger);
      const query = `project context and recent work`;
      const { context, ok } = await recallForContext(query);
      if (ok) {
        state2.recalledSessions.add(sessionId);
        if (state2.recalledSessions.size > 1e3) {
          const first = state2.recalledSessions.values().next().value;
          if (first) state2.recalledSessions.delete(first);
        }
      }
      if (context) {
        output.system[0] = output.system[0] ? `${output.system[0]}

${context}` : context;
        logger.debug(`Injected recall context for session ${sessionId}`);
      }
    } catch (e) {
      logger.error("System transform hook error", e);
    }
  };
  return {
    event,
    "experimental.session.compacting": compacting,
    "experimental.chat.system.transform": systemTransform
  };
}

// src/index.ts
var state = {
  turnCount: 0,
  missionsSet: /* @__PURE__ */ new Set(),
  recalledSessions: /* @__PURE__ */ new Set(),
  lastRetainedTurn: /* @__PURE__ */ new Map()
};
var HindsightPlugin = async (input, options) => {
  const config = loadConfig(options);
  const logger = new Logger({
    client: input.client,
    debug: config.debug
  });
  const client2 = new HindsightClient({
    baseUrl: config.hindsightApiUrl,
    apiKey: config.hindsightApiToken || void 0
  });
  const bankId = deriveBankId(config, input.directory);
  logger.info("Hindsight plugin initialized", {
    api: config.hindsightApiUrl,
    bank: bankId,
    authenticated: Boolean(config.hindsightApiToken),
    autoRecall: config.autoRecall,
    autoRetain: config.autoRetain
  });
  const tools = createTools(client2, bankId, config, state.missionsSet, logger);
  const hooks = createHooks(
    client2,
    bankId,
    config,
    state,
    input.client,
    logger
  );
  return {
    tool: tools,
    ...hooks
  };
};
var index_default = HindsightPlugin;
export {
  HindsightPlugin,
  index_default as default
};
//# sourceMappingURL=index.js.map