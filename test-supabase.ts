import { supabase } from './src/integrations/supabase/client';
(async () => {
  const { data: b } = await supabase.from('baixa_operacional').select('codigo_produto').limit(5);
  const { data: g } = await supabase.from('grupo_produtos').select('codigo_produto, grupo').limit(5);
  console.log('baixa_operacional sample:', b);
  console.log('grupo_produtos sample:', g);
})();
