import axios from 'axios';

import {
  clearClientAuthStorage,
  notifyAuthExpired,
} from '@/lib/authStorage';
import { getApiBaseUrl } from '@/lib/config';

const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Token ${token}`;
    }
  }

  // Let the browser set multipart boundaries for FormData uploads.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const requestUrl = String(error?.config?.url ?? '');
    const isCredentialRequest =
      requestUrl.includes('/users/login/') ||
      requestUrl.includes('/users/register/');

    if (
      status === 401 &&
      typeof window !== 'undefined' &&
      !isCredentialRequest
    ) {
      clearClientAuthStorage();
      notifyAuthExpired();
    }

    return Promise.reject(error);
  },
);

export default api;
