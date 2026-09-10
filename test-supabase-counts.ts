import { supabase } from './src/integrations/supabase/client';
(async () => {
  const { count: b } = await supabase.from('baixa_operacional').select('*', { count: 'exact', head: true });
  const { count: g } = await supabase.from('grupo_produtos').select('*', { count: 'exact', head: true });
  console.log('baixa_operacional count:', b);
  console.log('grupo_produtos count:', g);
})();
