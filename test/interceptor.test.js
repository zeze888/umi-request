import createTestServer from 'create-test-server';
import request, { extend, Onion, fetch } from '../src/index';

const debug = require('debug')('afx-request:test');

var Cancel = request.Cancel;
var CancelToken = request.CancelToken;

const writeData = (data, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.send(data);
};

describe('interceptor', () => {
  let server;
  beforeAll(async () => {
    server = await createTestServer();
  });
  afterAll(() => {
    server.close();
  });

  const prefix = api => `${server.url}${api}`;

  it('valid interceptor', async done => {
    expect.assertions(3);
    server.get('/test/interceptors', (req, res) => {
      writeData(req.query, res);
    });

    // return nothing test
    request.interceptors.request.use(() => ({}));

    // return same thing
    request.interceptors.response.use(res => res);

    // request interceptor of add param to options
    request.interceptors.request.use((url, options) => {
      return {
        url: `${url}?interceptors=yes`,
        options: { ...options, interceptors: true },
      };
    });

    // response interceptor, change response's header
    request.interceptors.response.use((res, options) => {
      res.headers.append('interceptors', 'yes yo');
      return res;
    });

    const response = await request(prefix('/test/interceptors'), {
      timeout: 1200,
      getResponse: true,
    });

    expect(response.data.interceptors).toBe('yes');
    expect(response.response.headers.get('interceptors')).toBe('yes yo');

    // invalid url
    try {
      request({ hello: 1 });
    } catch (error) {
      expect(error.message).toBe('url MUST be a string');
      done();
    }
  });

  it('global and instance interceptor', async done => {
    expect.assertions(6);
    server.get('/test/global/interceptors', (req, res) => {
      writeData(req.query, res);
    });

    // request global interceptors change request's url
    request.interceptors.request.use((url, options) => {
      return {
        url: `${url}&isGlobal=yes`,
        options: { ...options, interceptors: true },
      };
    });

    request.interceptors.request.use(
      (url, options) => {
        return {
          url: `${url}&instance=request`,
          options: { ...options, interceptors: true },
        };
      },
      { global: false }
    );

    request.interceptors.response.use(
      (res, options) => {
        res.headers.append('instance', 'yes request');
        return res;
      },
      { global: false }
    );

    const clientA = extend();

    // request instance self interceptors change request's url
    clientA.interceptors.request.use(
      (url, options) => {
        return {
          url: `${url}&instance=clientA`,
          options,
        };
      },
      { global: false }
    );

    // response instance self interceptor, change response's header
    clientA.interceptors.response.use(
      (res, options) => {
        res.headers.append('instance', 'yes clientA');
        return res;
      },
      { global: false }
    );

    const responseClientA = await clientA(prefix('/test/global/interceptors'), {
      getResponse: true,
    });

    const response = await request(prefix('/test/global/interceptors'), {
      getResponse: true,
    });

    expect(response.data.instance).toBe('request');
    expect(response.data.isGlobal).toBe('yes');
    expect(response.response.headers.get('instance')).toBe('yes request');

    expect(responseClientA.data.instance).toBe('clientA');
    expect(responseClientA.data.isGlobal).toBe('yes');
    expect(responseClientA.response.headers.get('instance')).toBe('yes clientA');
    done();
  });

  it('invalid interceptor constructor', async done => {
    expect.assertions(2);
    try {
      request.interceptors.request.use('invalid interceptor');
    } catch (error) {
      expect(error.message).toBe('Interceptor must be function!');
    }
    try {
      request.interceptors.response.use('invalid interceptor');
    } catch (error) {
      expect(error.message).toBe('Interceptor must be function!');
    }
    done();
  });

  it('use interceptor to modify request data', async done => {
    server.post('/test/post/interceptors', (req, res) => {
      writeData(req.body, res);
    });
    request.interceptors.request.use((url, options) => {
      if (options.method.toLowerCase() === 'post') {
        options.data = {
          ...options.data,
          foo: 'foo',
        };
      }
      return { url, options };
    });

    const data = await request(prefix('/test/post/interceptors'), {
      method: 'post',
      data: { bar: 'bar' },
    });
    expect(data.foo).toBe('foo');
    done();
  });

  // use promise to test
  it('use promise interceptor to modify request data', async done => {
    server.post('/test/promiseInterceptors', (req, res) => {
      writeData(req.body, res);
    });

    request.interceptors.request.use((url, options) => {
      return new Promise(resolve => {
        setTimeout(() => {
          if (options.method.toLowerCase() === 'post') {
            options.data = {
              ...options.data,
              promiseFoo: 'promiseFoo',
            };
          }
          resolve({ url, options });
        }, 1000);
      });
    });

    const data = await request(prefix('/test/promiseInterceptors'), {
      method: 'post',
      data: { bar: 'bar' },
    });
    expect(data.promiseFoo).toBe('promiseFoo');
    done();
  });

  // reject in interceptor
  it('throw error in response interceptor', async done => {
    server.post('/test/reject/interceptor', (req, res) => {
      writeData(req.body, res);
    });

    request.interceptors.response.use((response, options) => {
      const { status, url } = response;
      console.log('status', status, url);
      if (status === 200 && url.indexOf('/test/reject/interceptor')) {
        throw Error('reject when response is 200 status');
      }
    });

    try {
      const data = await request(prefix('/test/reject/interceptor'), { method: 'post' });
    } catch (e) {
      expect(e.message).toBe('reject when response is 200 status');
      done();
    }
  });
});
