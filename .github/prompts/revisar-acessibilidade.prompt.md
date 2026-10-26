---
name: revisar-acessibilidade
description: "Avalia a acessibilidade de uma tela ou componente React do DMS."
argument-hint: "Caminho do componente ou descrição do fluxo"
agent: accessibility-reviewer
---

# Revisar acessibilidade

Avalie a acessibilidade de:
${input:alvo:Informe o caminho do componente ou o fluxo a revisar}

## Tarefa

1. Localize o alvo e leia os componentes e estilos diretamente relacionados.
2. Identifique as interações e os estados existentes, incluindo
   carregamento, sucesso, erro e ausência de documentos.
3. Aplique os critérios do agente ao escopo informado.
4. Apresente os achados com evidência, impacto, correção recomendada
   e forma de validação.

## Limites

- Não altere arquivos.
- Se o alvo não for encontrado ou for ambíguo, peça esclarecimento.
- Não amplie a revisão para todo o projeto sem necessidade.
- Não afirme ter testado teclado, leitor de tela ou contraste renderizado
  quando a avaliação tiver sido apenas estática.
