import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch } from '../store';
import { addToast } from '../store/toast';

export function useUnboundFeatureToast(): (featureName: string) => void {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('gameroom');

  return useCallback(
    (featureName: string) => {
      console.warn(`[CanvasToolbar] unbound feature: ${featureName}`);
      dispatch(addToast('info', t('toolbar.unboundToast')));
    },
    [dispatch, t],
  );
}
