
create or replace function public.pode_ver_documento_baixa(_path text, _uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_gestor(_uid)
      or public.has_role(_uid, 'AUDITOR')
      or public.has_role(_uid, 'DIRETOR_OPERACOES')
      or public.has_role(_uid, 'COORDENADOR_FINANCEIRO')
      or exists (
        select 1 from public.baixa_operacional b
        where b.solicitante_id = _uid
          and 'req-' || b.solicitacao_id::text = (storage.foldername(_path))[1]
      )
$$;

drop policy if exists "docs baixa leitura autenticada" on storage.objects;
drop policy if exists "docs baixa update autenticado" on storage.objects;
drop policy if exists "docs baixa upload autenticado" on storage.objects;

create policy "docs baixa leitura restrita" on storage.objects for select to authenticated
using (bucket_id = 'documentos-baixa' and public.pode_ver_documento_baixa(name, auth.uid()));

create policy "docs baixa upload restrito" on storage.objects for insert to authenticated
with check (bucket_id = 'documentos-baixa' and (public.is_gestor(auth.uid()) or public.has_role(auth.uid(),'DIRETOR_OPERACOES') or public.has_role(auth.uid(),'COORDENADOR_FINANCEIRO')));

create policy "docs baixa update restrito" on storage.objects for update to authenticated
using (bucket_id = 'documentos-baixa' and (public.is_gestor(auth.uid()) or public.has_role(auth.uid(),'DIRETOR_OPERACOES') or public.has_role(auth.uid(),'COORDENADOR_FINANCEIRO')))
with check (bucket_id = 'documentos-baixa' and (public.is_gestor(auth.uid()) or public.has_role(auth.uid(),'DIRETOR_OPERACOES') or public.has_role(auth.uid(),'COORDENADOR_FINANCEIRO')));
