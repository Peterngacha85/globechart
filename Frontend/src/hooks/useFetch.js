import { useCallback, useEffect, useRef, useState } from 'react';
import api, { errorMessage } from '../services/api';

/** GET `url` (with params) and track loading/error. `reload()` refetches without unmounting the data. */
export default function useFetch(url, params) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const paramsKey = JSON.stringify(params || {});
  const latest = useRef(0);

  const load = useCallback(async () => {
    const id = ++latest.current;
    setError('');
    try {
      const res = await api.get(url, { params: JSON.parse(paramsKey) });
      if (id === latest.current) setData(res.data.data);
    } catch (err) {
      if (id === latest.current) setError(errorMessage(err));
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [url, paramsKey]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
