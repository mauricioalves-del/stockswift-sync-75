-- Lista de Movimentados: envio automático passa das 18h para as 22h de Brasília (dias úteis).
-- 22h BRT = 01h UTC do dia seguinte → terça a sábado em UTC. A função usa a data de São Paulo, então continua enviando o dia correto.
SELECT cron.alter_job(jobid, schedule := m.novo)
FROM cron.job j JOIN (VALUES ('lista-movimentados-fabrica', '0 1 * * 2-6'), ('lista-movimentados-processo', '1 1 * * 2-6'),
  ('lista-movimentados-qualidade', '2 1 * * 2-6'), ('lista-movimentados-para', '3 1 * * 2-6')) AS m(nome, novo) ON m.nome = j.jobname;
