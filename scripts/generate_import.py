#!/usr/bin/env python3
"""
Generate TypeScript import data from the financial CSV documents stored in the JSONL session.
"""
import json, csv, io, sys, re, os

# Force UTF-8 output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

JSONL = r'C:\Users\RafaelLombardi\.claude\projects\c--VS-Code-WnrFinance\4c102b64-acad-4982-b5f1-4a8bcea89d82.jsonl'

with open(JSONL, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Line 632 has the richer dataset (with CNPJ)
obj632 = json.loads(lines[631])
raw2 = obj632['message']['content'][0]['source']['data']

def fix_str(s):
    """Fix double-encoded UTF-8 (Latin-1 interpreted UTF-8 bytes)"""
    try:
        return s.encode('latin-1').decode('utf-8').lstrip('﻿')
    except UnicodeDecodeError:
        # Fallback: fix char by char
        result = []
        i = 0
        while i < len(s):
            try:
                b = s[i].encode('latin-1')
                # Try to decode as multi-byte UTF-8 with next chars
                combined = b
                for j in range(1, 4):
                    if i + j < len(s):
                        try:
                            nb = s[i+j].encode('latin-1')
                            combined += nb
                            try:
                                decoded = combined.decode('utf-8')
                                result.append(decoded)
                                i += j + 1
                                break
                            except:
                                pass
                        except:
                            break
                else:
                    result.append(s[i])
                    i += 1
            except (UnicodeEncodeError, ValueError):
                result.append(s[i])
                i += 1
        return ''.join(result).lstrip('﻿')

raw2_fixed = fix_str(raw2)
reader = csv.DictReader(io.StringIO(raw2_fixed))
raw_rows = list(reader)
rows = [{k.strip().lstrip('﻿'): v.strip() if v else '' for k, v in row.items()} for row in raw_rows]

# Collect unique categories
cats = {}
for r in rows:
    cat = r.get('Categoria', '').strip()
    tipo = r.get('Tipo', '').strip()
    if cat:
        if cat not in cats:
            cats[cat] = 'despesa' if tipo == 'Despesa' else 'receita'
            # Some categories are ambos
            if 'Investimento' in cat:
                cats[cat] = 'ambos'

# Collect unique clients (Receita rows)
clients = {}
for r in rows:
    tipo = r.get('Tipo', '').strip()
    name = r.get('Cliente/Fornecedor', '').strip()
    doc = r.get('Documento Cliente/Fornecedor', '').strip()
    if tipo == 'Receita' and name and name != 'Diversos':
        if name not in clients:
            clients[name] = doc

# Collect unique suppliers (Despesa rows), excluding employees and tax entries
EMPLOYEE_CATS = {'Salário / Funcionário', 'Reembolso / Funcionário', 'Horas Extras / Funcionário',
                 'Vale Alimentação / Funcionário', 'Vale Transporte / Funcionário',
                 'FGTS / Funcionário', 'Seguro de Vida / Funcionário', 'Assistência Medica / Funcionário',
                 'Cursos e Treinamentos / Funcionário'}
TAX_CATS = {'DAS / Impostos', 'DARF - DCTFWEB / Impostos'}

employees = {}
suppliers = {}
for r in rows:
    tipo = r.get('Tipo', '').strip()
    name = r.get('Cliente/Fornecedor', '').strip()
    doc = r.get('Documento Cliente/Fornecedor', '').strip()
    cat = r.get('Categoria', '').strip()
    if tipo == 'Despesa' and name and name not in ('Diversos', 'DARF - DCTFWEB', 'DAS', 'FGTS', 'ITAU- TARIFAS', 'CDB - INTER'):
        if cat in EMPLOYEE_CATS:
            if name not in employees:
                employees[name] = doc
        elif name not in suppliers and name not in employees:
            suppliers[name] = doc

# Collect all movements
movements = []
for r in rows:
    tipo = r.get('Tipo', '').strip()
    conta = r.get('Nome da Conta Financeira', '').strip()
    quitado = r.get('Quitado', '').strip()
    vencimento = r.get('Vencimento', '').strip()
    competencia = r.get('Competência', '').strip() or r.get('Competencia', '').strip()
    valor = r.get('Valor (R$)', '').strip()
    cat = r.get('Categoria', '').strip()
    name = r.get('Cliente/Fornecedor', '').strip()
    doc_num = r.get('Numero da Nota Fiscal', '').strip()
    forma_pag = r.get('Forma de Pagamento - Quitação', '').strip() or r.get('Forma de Pagamento - Parcela', '').strip()
    desc = r.get('Observação/Descrição', '').strip()

    if not vencimento or not valor:
        continue

    # Parse date DD/MM/YYYY
    try:
        d, m, y = vencimento.split('/')
        iso_date = f'{y}-{m}-{d}'
    except:
        continue

    try:
        amount = float(valor.replace(',', '.'))
    except:
        continue

    status = 'pago' if quitado == 'Sim' and tipo == 'Despesa' else (
             'recebido' if quitado == 'Sim' and tipo == 'Receita' else 'pendente')

    # Map payment method
    pag_map = {
        'Boleto Bancário': 'boleto', 'Boleto Bancario': 'boleto',
        'Pix': 'pix', 'PIX': 'pix',
        'Transferência Bancária': 'transferencia', 'Transferencia Bancaria': 'transferencia',
        'Débito em Conta': 'debito', 'Debito em Conta': 'debito',
        'Outros': 'outros',
    }
    pay_method = pag_map.get(forma_pag, 'outros')

    movements.append({
        'tipo': tipo,
        'conta': conta,
        'cat': cat,
        'name': name,
        'amount': amount,
        'dueDate': iso_date,
        'status': status,
        'payMethod': pay_method,
        'nf': doc_num,
        'desc': desc,
        'quitado': quitado == 'Sim',
    })

print(f'Categories: {len(cats)}')
print(f'Clients: {len(clients)}')
print(f'Suppliers: {len(suppliers)}')
print(f'Employees: {len(employees)}')
print(f'Movements: {len(movements)}')
print()

# Write the processed data to JSON
output = {
    'categories': [{'name': k, 'type': v} for k, v in sorted(cats.items())],
    'clients': [{'name': k, 'document': v} for k, v in sorted(clients.items())],
    'suppliers': [{'name': k, 'document': v} for k, v in sorted(suppliers.items())],
    'employees': [{'name': k, 'document': v} for k, v in sorted(employees.items())],
    'movements': movements,
}

out_path = r'C:\VS-Code_WnrFinance\scripts\import_data.json'
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f'Data written to {out_path}')

# Print sample
print()
print('Sample categories:')
for c in list(cats.items())[:5]:
    print(f'  {c}')
print()
print('Sample clients:')
for c in list(clients.items())[:5]:
    print(f'  {c}')
print()
print('Sample movements (first 3):')
for m in movements[:3]:
    print(f'  {m}')
