import { logger } from '../utils/logger'
import axios from 'axios'
import https from 'https'


interface GeminiResponse {
  candidates: Array<{
    content: {
      parts?: Array<{
        text: string
      }>
      text?: string
    } | string
  }>
}

class GeminiService {
  private apiKey: string
  private baseUrl: string = 'https://generativelanguage.googleapis.com/v1beta'

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || ''

    if (!this.apiKey) {
      logger.warn('⚠️  GEMINI_API_KEY no configurada. Usando modo simulación.')
    } else {
      logger.info('✅ Gemini AI client initialized with API key: ' + this.apiKey.substring(0, 20) + '...')
    }
  }

  /**
   * Genera una pregunta de entrevista inteligente
   */
  async generateInterviewQuestion(
    role: string = 'desarrollador',
    difficulty: 'junior' | 'mid' | 'senior' = 'mid',
    category: 'technical' | 'behavioral' | 'situational' = 'technical'
  ): Promise<string> {
    if (!this.apiKey) {
      return this.getMockQuestion(category, difficulty)
    }

    try {
      const prompt = this.buildQuestionPrompt(role, difficulty, category)
      const response = await this.makeRequest(prompt)

      return this.extractTextFromResponse(response)
    } catch (error) {
      logger.error('Error generating question with Gemini:', error)
      return this.getMockQuestion(category, difficulty)
    }
  }

  /**
   * Evalúa la respuesta del usuario a una pregunta de entrevista
   */
  async evaluateInterviewResponse(
    question: string,
    userResponse: string,
    role: string = 'desarrollador'
  ): Promise<{
    score: number
    feedback: string
    strengths: string[]
    improvements: string[]
    technical_accuracy: number
    communication_clarity: number
    completeness: number
  }> {
    if (!this.apiKey) {
      return this.getMockEvaluation(userResponse)
    }

    try {
      const prompt = this.buildEvaluationPrompt(question, userResponse, role)
      const response = await this.makeRequest(prompt)

      return this.parseEvaluationResponse(this.extractTextFromResponse(response))
    } catch (error) {
      logger.error('Error evaluating response with Gemini:', error)
      return this.getMockEvaluation(userResponse)
    }
  }

  /**
   * Realiza la petición HTTP a Gemini API usando axios
   */
  private async makeRequest(prompt: string): Promise<GeminiResponse> {
    const url = `${this.baseUrl}/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`

    logger.info('🌐 Llamando a Gemini API:', {
      model: 'gemini-2.5-flash',
      promptLength: prompt.length,
      hasApiKey: !!this.apiKey
    })

    const payload = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.3, // Reducido de 0.7 a 0.3 para respuestas más deterministas
        topK: 20, // Reducido de 40 a 20 para mayor precisión
        topP: 0.8, // Reducido de 0.95 a 0.8
        maxOutputTokens: 2048, // Aumentado de 1024 a 2048 para respuestas completas
      }
    }

    // Configurar agent HTTPS para ignorar certificados SSL (solo desarrollo)
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false // Desactivar verificación SSL completamente
    })

    try {
      const response = await axios.post<GeminiResponse>(url, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        httpsAgent,
        timeout: 60000 // 60 segundos - más tiempo para Gemini
      })

      logger.info('✅ Gemini API respuesta exitosa')
      return response.data

    } catch (error: any) {
      if (error.response) {
        // Error de respuesta del servidor
        logger.error('❌ Gemini API error:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        })
        throw new Error(`Gemini API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`)
      } else if (error.request) {
        // Error de conexión
        logger.error('❌ Error de conexión a Gemini API:', error.message)
        throw new Error(`Error de conexión a Gemini API: ${error.message}`)
      } else {
        // Otro tipo de error
        logger.error('❌ Error inesperado:', error.message)
        throw new Error(`Error inesperado: ${error.message}`)
      }
    }
  }

  /**
   * Extrae el texto de la respuesta de Gemini - MEJORADO para manejar diferentes formatos
   */
  private extractTextFromResponse(response: GeminiResponse): string {
    try {
      logger.info('🔍 Analizando estructura de respuesta de Gemini...')

      if (!response || typeof response !== 'object') {
        logger.error('❌ Respuesta no es un objeto válido')
        throw new Error('Respuesta inválida de Gemini')
      }

      if (!response.candidates || response.candidates.length === 0) {
        logger.error('❌ No hay candidates en la respuesta')
        throw new Error('Respuesta vacía de Gemini')
      }

      const candidate = response.candidates[0]

      if (!candidate || !candidate.content) {
        logger.error('❌ Candidate no tiene content')
        throw new Error('Candidate sin contenido')
      }

      // MANEJO MEJORADO: Verificar diferentes estructuras posibles con casting seguro
      let text = ''

      // Estructura 1: content como string directo
      if (typeof candidate.content === 'string') {
        text = candidate.content
        logger.info('✅ Texto extraído de content directo')
      }
      // Estructura 2: content como objeto
      else if (typeof candidate.content === 'object') {
        const contentObj = candidate.content as any // Casting seguro para manejo flexible

        // Formato 2a: content.parts[].text (formato esperado)
        if (contentObj.parts && Array.isArray(contentObj.parts) && contentObj.parts.length > 0) {
          text = contentObj.parts[0]?.text || ''
          logger.info('✅ Texto extraído de parts[0].text')
        }
        // Formato 2b: content.text (formato alternativo)
        else if (contentObj.text && typeof contentObj.text === 'string') {
          text = contentObj.text
          logger.info('✅ Texto extraído de content.text')
        }
        // Formato 2c: Buscar text en cualquier nivel
        else {
          logger.info('🔍 Buscando text en estructura no estándar...')
          const findText = (obj: any): string => {
            if (typeof obj === 'string') return obj
            if (typeof obj !== 'object' || obj === null) return ''

            if (obj.text && typeof obj.text === 'string') return obj.text

            for (const key in obj) {
              if (obj.hasOwnProperty(key)) {
                const result = findText(obj[key])
                if (result) return result
              }
            }
            return ''
          }

          text = findText(contentObj)
          if (text) {
            logger.info('✅ Texto encontrado en búsqueda recursiva')
          }
        }
      }

      if (!text || text.trim().length === 0) {
        logger.error('❌ No se pudo extraer texto de la respuesta')
        logger.error('📊 Estructura de content:', JSON.stringify(candidate.content, null, 2))
        throw new Error('No se encontró texto en la respuesta')
      }

      logger.info('✅ Texto extraído exitosamente:', text.substring(0, 100) + '...')
      return text.trim()
    } catch (error) {
      logger.error('❌ Error extracting text from Gemini response:', error)
      throw error
    }
  }

  /**
   * Construye el prompt para generar preguntas
   */
  private buildQuestionPrompt(role: string, difficulty: string, category: string): string {
    return `Eres un experto reclutador de tecnología. Genera UNA pregunta de entrevista para un ${role} nivel ${difficulty}.

Categoría: ${category}
- Si es "technical": pregunta sobre conocimientos técnicos, código, arquitectura
- Si es "behavioral": pregunta sobre comportamiento, trabajo en equipo, liderazgo  
- Si es "situational": pregunta sobre situaciones hipotéticas, resolución de problemas

Formato de respuesta: Solo la pregunta, sin introducción ni comentarios adicionales.

Ejemplos de buenas preguntas:
- Technical: "¿Cómo implementarías un sistema de caché para una aplicación web de alto tráfico?"
- Behavioral: "Cuéntame sobre una vez que tuviste que resolver un conflicto con un compañero de equipo"
- Situational: "¿Qué harías si descubrieras un bug crítico en producción 5 minutos antes de una demo importante?"

Genera la pregunta:`
  }

  /**
   * Construye el prompt para evaluar respuestas
   */
  private buildEvaluationPrompt(question: string, response: string, role: string): string {
    return `Eres un experto evaluador de entrevistas técnicas. Evalúa esta respuesta de candidato para ${role}.

PREGUNTA: "${question}"

RESPUESTA DEL CANDIDATO: "${response}"

Evalúa la respuesta usando estos criterios:
1. Precisión técnica (1-10)
2. Claridad de comunicación (1-10) 
3. Completitud de la respuesta (1-10)

Responde EXACTAMENTE en este formato JSON (sin comentarios adicionales):

{
  "score": [número del 1-10],
  "feedback": "[feedback general en español, máximo 100 palabras]",
  "strengths": ["[fortaleza 1]", "[fortaleza 2]"],
  "improvements": ["[mejora 1]", "[mejora 2]"],
  "technical_accuracy": [número 1-10],
  "communication_clarity": [número 1-10],
  "completeness": [número 1-10]
}`
  }

  /**
   * Parsea la respuesta de evaluación JSON
   */
  private parseEvaluationResponse(response: string): any {
    try {
      // Extraer JSON de la respuesta
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
      throw new Error('No JSON found in response')
    } catch (error) {
      logger.error('Error parsing evaluation response:', error)
      return this.getMockEvaluation('')
    }
  }

  /**
   * Pregunta simulada para modo sin API
   */
  private getMockQuestion(category: string, difficulty: string): string {
    const questions = {
      technical: {
        junior: '¿Cuál es la diferencia entre let, const y var en JavaScript?',
        mid: '¿Cómo implementarías un sistema de autenticación con JWT?',
        senior: '¿Cómo diseñarías la arquitectura de microservicios para una plataforma de e-commerce?'
      },
      behavioral: {
        junior: 'Describe una situación donde tuviste que aprender una tecnología nueva rápidamente',
        mid: 'Cuéntame sobre un proyecto desafiante en el que trabajaste y cómo lo resolviste',
        senior: 'Describe cómo has mentorizado a desarrolladores junior en tu experiencia'
      },
      situational: {
        junior: '¿Qué harías si encuentras un bug en el código de un compañero?',
        mid: '¿Cómo priorizarías las tareas cuando tienes múltiples deadlines urgentes?',
        senior: '¿Cómo manejarías la migración de una aplicación legacy a tecnologías modernas?'
      }
    }

    return questions[category as keyof typeof questions][difficulty as keyof typeof questions.technical] ||
      'Háblame sobre tu experiencia en desarrollo de software'
  }

  /**
   * Analiza la respuesta del usuario y determina si generar una pregunta de seguimiento
   */
  async analyzeResponseForFollowUp(
    originalQuestion: string,
    userResponse: string,
    interviewContext: {
      role: string
      currentQuestionIndex: number
      totalQuestions: number
      previousResponses: string[]
    }
  ): Promise<{
    shouldAskFollowUp: boolean
    followUpQuestion?: string
    reasoning: string
    interestingPoints: string[]
  }> {
    if (!this.apiKey) {
      return this.getMockFollowUpAnalysis(userResponse)
    }

    try {
      const prompt = this.buildFollowUpAnalysisPrompt(
        originalQuestion,
        userResponse,
        interviewContext
      )
      const response = await this.makeRequest(prompt)

      return this.parseFollowUpResponse(this.extractTextFromResponse(response))
    } catch (error) {
      logger.error('Error analyzing response for follow-up:', error)
      return this.getMockFollowUpAnalysis(userResponse)
    }
  }

  /**
   * Construye el prompt para analizar si hacer pregunta de seguimiento
   */
  private buildFollowUpAnalysisPrompt(
    originalQuestion: string,
    userResponse: string,
    context: any
  ): string {
    return `Eres una IA entrevistadora experta que analiza respuestas para decidir si hacer seguimiento.

PREGUNTA: "${originalQuestion}"
RESPUESTA: "${userResponse}"

ANÁLISIS:
- Si la respuesta es muy corta o vaga → hacer seguimiento
- Si ya tiene suficiente detalle → continuar
- Si menciona algo específico interesante → explorar más

Tu pregunta de seguimiento debe ser específica al contexto de lo que mencionó el candidato, no genérica.

Responde en JSON:
{
  "shouldAskFollowUp": true/false,
  "followUpQuestion": "pregunta específica o null",
  "reasoning": "razón breve",
  "interestingPoints": ["aspectos relevantes"]
}`
  }

  /**
   * Parsea la respuesta de análisis de seguimiento
   */
  private parseFollowUpResponse(response: string): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
      throw new Error('No JSON found in response')
    } catch (error) {
      logger.error('Error parsing follow-up response:', error)
      return this.getMockFollowUpAnalysis('')
    }
  }

  /**
   * Análisis simulado para modo sin API - SIMPLE para no interferir con Gemini
   */
  private getMockFollowUpAnalysis(response: string): any {
    // Modo mock ultra-simple: NUNCA hacer seguimiento
    // Gemini real debe manejar toda la lógica inteligente
    return {
      shouldAskFollowUp: false,
      followUpQuestion: null,
      reasoning: "Modo simulación - Gemini real debe manejar el análisis",
      interestingPoints: ["Respuesta recibida"]
    }
  }

  /**
   * Genera un comentario natural y empático sobre la respuesta del usuario
   */
  async generateNaturalComment(
    userResponse: string,
    questionContext: string,
    commentType: 'transition' | 'follow-up-intro' = 'transition'
  ): Promise<string> {
    if (!this.apiKey) {
      return this.getMockNaturalComment(userResponse, commentType)
    }

    try {
      const prompt = this.buildNaturalCommentPrompt(userResponse, questionContext, commentType)
      const response = await this.makeRequest(prompt)

      return this.extractTextFromResponse(response).trim()
    } catch (error) {
      logger.error('Error generating natural comment:', error)
      return this.getMockNaturalComment(userResponse, commentType)
    }
  }

  /**
   * Construye el prompt para generar comentarios naturales
   */
  private buildNaturalCommentPrompt(
    userResponse: string,
    questionContext: string,
    commentType: string
  ): string {
    const typeInstruction = commentType === 'follow-up-intro'
      ? 'Genera una introducción natural antes de hacer una pregunta de seguimiento'
      : 'Genera un comentario de transición empático antes de pasar a la siguiente pregunta'

    return `Eres una entrevistadora virtual empática y profesional. ${typeInstruction}.

CONTEXTO DE LA PREGUNTA: "${questionContext}"
RESPUESTA DEL USUARIO: "${userResponse}"

INSTRUCCIONES:
- Genera UN comentario corto (máximo 15 palabras)
- Debe sonar natural, empático y profesional
- Debe reflejar que realmente escuchaste y entendiste la respuesta
- Menciona algo específico que el usuario dijo
- Usa un tono conversacional, como si fueras una persona real
- Evita ser genérico o robótico

EJEMPLOS DE BUENOS COMENTARIOS:
- "Qué interesante tu experiencia con Django para desarrollo web"
- "Me gusta que combines análisis de datos con desarrollo"
- "Veo que tienes buena experiencia en automatización con Python"
- "Perfecto, dominas un stack muy sólido para desarrollo web"

Genera SOLO el comentario, sin explicaciones adicionales:`
  }

  /**
   * Genera comentarios naturales simulados para modo sin API
   */
  private getMockNaturalComment(response: string, commentType: string): string {
    const lowerResponse = response.toLowerCase()
    const isJuniorProfile = /\b(recién|egresado|graduado|sin experiencia|junior|estudiante|institución|universidad|pequeños)\b/i.test(lowerResponse)

    if (commentType === 'follow-up-intro') {
      if (isJuniorProfile) {
        if (lowerResponse.includes('machine learning')) {
          return "Qué interesante tu experiencia con machine learning"
        } else if (lowerResponse.includes('paginas web') || lowerResponse.includes('web')) {
          return "Valioso tu trabajo en desarrollo web"
        } else if (lowerResponse.includes('qa')) {
          return "Excelente que hayas explorado el área de QA"
        } else {
          return "Me parecen valiosos esos proyectos académicos"
        }
      } else if (lowerResponse.includes('python') && lowerResponse.includes('django')) {
        return "Interesante combinación de Python y Django"
      } else if (lowerResponse.includes('datos') || lowerResponse.includes('análisis')) {
        return "Me llama la atención tu trabajo con datos"
      } else if (lowerResponse.includes('automatización') || lowerResponse.includes('automatizar')) {
        return "Qué valioso tu enfoque en automatización"
      } else {
        return "Me parece interesante lo que comentas"
      }
    } else {
      // Comentarios de transición más específicos y empáticos
      if (isJuniorProfile) {
        if (lowerResponse.includes('machine learning')) {
          return "Impresionante tu experiencia con ML como estudiante"
        } else if (lowerResponse.includes('paginas web') || lowerResponse.includes('web')) {
          return "Excelente base en desarrollo web"
        } else if (lowerResponse.includes('qa')) {
          return "Muy buena experiencia en testing y QA"
        } else if (lowerResponse.includes('proyecto')) {
          return "Valiosos esos proyectos para tu formación"
        } else {
          return "Perfecto, entiendo tu perfil como recién egresado"
        }
      } else if (lowerResponse.includes('python') && lowerResponse.includes('django')) {
        return "Excelente stack con Python y Django"
      } else if (lowerResponse.includes('javascript') && lowerResponse.includes('python')) {
        return "Muy buena combinación de tecnologías"
      } else if (lowerResponse.includes('datos') || lowerResponse.includes('análisis')) {
        return "Me gusta mucho tu enfoque hacia los datos"
      } else if (lowerResponse.includes('automatización') || lowerResponse.includes('automatizar')) {
        return "Valioso tu trabajo en automatización"
      } else if (lowerResponse.includes('empresa') || lowerResponse.includes('proyecto')) {
        return "Interesante tu experiencia profesional"
      } else if (lowerResponse.includes('aprender') || lowerResponse.includes('intermedio')) {
        return "Me gusta tu honestidad y ganas de crecer"
      } else {
        return "Perfecto, entiendo tu experiencia"
      }
    }
  }

  /**
   * Evaluación simulada para modo sin API
   */
  private getMockEvaluation(response: string): any {
    const wordCount = response.split(' ').length
    const baseScore = Math.min(10, Math.max(1, Math.floor(wordCount / 10)))

    return {
      score: baseScore,
      feedback: 'Respuesta clara y bien estructurada. Se nota conocimiento del tema.',
      strengths: [
        'Comunicación clara y directa',
        'Demuestra conocimiento técnico'
      ],
      improvements: [
        'Podría agregar más ejemplos específicos',
        'Considerar aspectos de escalabilidad'
      ],
      technical_accuracy: baseScore,
      communication_clarity: Math.min(10, baseScore + 1),
      completeness: Math.max(1, baseScore - 1)
    }
  }

  /**
   * NUEVO: Zavi se presenta y da la bienvenida
   */
  async generateWelcomeMessage(): Promise<string> {
    logger.info('👋 generateWelcomeMessage - API Key presente:', !!this.apiKey)

    if (!this.apiKey) {
      logger.warn('⚠️ Usando mock para welcome message')
      return "¡Hola! Soy Zavi, tu entrevistadora virtual. Me da mucho gusto conocerte y estoy muy emocionada de realizar esta entrevista contigo."
    }

    try {
      logger.info('🎯 Generando welcome message con Gemini...')
      const prompt = `Eres Zavi, una entrevistadora virtual profesional y empática.

INSTRUCCIONES MUY CLARAS:
1. Preséntate como "Zavi, tu entrevistadora virtual"
2. Da una bienvenida cálida y profesional al candidato
3. Usa un tono empático y motivador
4. Menciona que estás emocionada de conocerlo
5. Haz que se sienta cómodo y bienvenido
6. Escribe 3-4 oraciones completas
7. NO uses palabras como "model", "AI", "sistema"
8. Responde SOLO con el mensaje de bienvenida, SIN prefijos ni etiquetas

EJEMPLO del tipo de respuesta que necesito:
"¡Hola! Soy Zavi, tu entrevistadora virtual. Me da mucho gusto conocerte y estoy muy emocionada de realizar esta entrevista contigo. Mi objetivo es crear un ambiente cómodo donde puedas compartir tu experiencia. ¡Estoy lista para comenzar cuando tú lo estés!"

AHORA genera TU mensaje de bienvenida siguiendo este estilo:`

      const response = await this.makeRequest(prompt)
      const message = this.extractTextFromResponse(response).trim()

      // Validación adicional para evitar respuestas problemáticas
      if (message.toLowerCase().includes('model') || message.length < 20 || message.toLowerCase().includes('como ai')) {
        logger.warn('⚠️ Respuesta de Gemini problemática, usando fallback')
        return "¡Hola! Soy Zavi, tu entrevistadora virtual. Me da mucho gusto conocerte y estoy muy emocionada de realizar esta entrevista contigo. Mi objetivo es crear un ambiente cómodo donde puedas compartir tu experiencia y mostrar tu talento. ¡Estoy lista para comenzar cuando tú lo estés!"
      }

      logger.info('✅ Welcome message generado exitosamente:', message.substring(0, 60) + '...')
      return message
    } catch (error) {
      logger.error('❌ Error generating welcome:', error)
      return "¡Hola! Soy Zavi, tu entrevistadora virtual. Me da mucho gusto conocerte y estoy muy emocionada de realizar esta entrevista contigo. Mi objetivo es crear un ambiente cómodo donde puedas compartir tu experiencia y mostrar tu talento. ¡Estoy lista para comenzar cuando tú lo estés!"
    }
  }

  /**
   * NUEVO: Zavi explica cómo será la entrevista
   */
  async generateInterviewExplanation(): Promise<string> {
    if (!this.apiKey) {
      return "Te explico cómo funcionará: Tendremos una conversación donde te haré 5 preguntas clave. Luego podrás hacerme preguntas a mí. Al final recibirás retroalimentación detallada."
    }

    try {
      const prompt = `Eres Zavi, la entrevistadora virtual que ya se presentó al candidato.

TAREA: Explicar cómo funcionará la entrevista de forma clara y motivadora.

ESTRUCTURA DE LA ENTREVISTA:
1. 5 preguntas que tú harás al candidato
2. El candidato puede hacerte preguntas sobre la empresa/posición
3. Despedida y evaluación final

INSTRUCCIONES ESPECÍFICAS:
- NO te presentes de nuevo, NO digas "Hola" ni "Soy Zavi"
- Explica las 3 fases de forma clara y directa
- Usa 3-4 oraciones completas
- Sé motivadora y positiva
- Menciona que será una conversación natural
- NO uses palabras como "model", "AI", "sistema"

EJEMPLO del tipo de respuesta necesaria:
"Te explico cómo funcionará nuestra entrevista: Primero, te haré 5 preguntas para conocer tu experiencia y habilidades. Después, tendrás la oportunidad de hacerme preguntas sobre la empresa y el puesto. Al final, procesaré toda la información para darte retroalimentación valiosa."

AHORA genera TU explicación siguiendo este estilo:`

      const response = await this.makeRequest(prompt)
      const message = this.extractTextFromResponse(response).trim()

      // Validación para evitar respuestas problemáticas
      if (message.toLowerCase().includes('model') || message.length < 20) {
        logger.warn('⚠️ Respuesta de explicación problemática, usando fallback')
        return "Te explico cómo funcionará nuestra entrevista: Primero, te haré 5 preguntas para conocer tu experiencia y habilidades. Después, tendrás la oportunidad de hacerme preguntas sobre la empresa y el puesto. Al final, procesaré toda la información para darte retroalimentación valiosa sobre tu desempeño."
      }

      return message
    } catch (error) {
      logger.error('Error generating explanation:', error)
      return "Te explico cómo funcionará nuestra entrevista: Primero, te haré 5 preguntas para conocer tu experiencia y habilidades. Después, tendrás la oportunidad de hacerme preguntas sobre la empresa y el puesto. Al final, procesaré toda la información para darte retroalimentación valiosa sobre tu desempeño."
    }
  }

  /**
   * NUEVO: Zavi genera la primera pregunta de entrevista
   */
  async generateFirstQuestion(): Promise<string> {
    if (!this.apiKey) {
      return "Para comenzar, cuéntame sobre ti y tu experiencia más relevante."
    }

    try {
      const prompt = `Eres Zavi, la entrevistadora virtual que ya explicó el proceso.

TAREA: Generar la PRIMERA pregunta de entrevista para que el candidato se presente.

INSTRUCCIONES ESPECÍFICAS:
- NO te presentes de nuevo, NO digas "Hola" ni "Soy Zavi"
- Haz una pregunta abierta sobre su experiencia y trayectoria
- Invita al candidato a presentarse de forma natural
- Usa un tono conversacional y cercano
- La pregunta debe ser de 2-3 oraciones máximo
- NO uses palabras como "model", "AI", "sistema"
- Transmite interés genuino en conocerlo

EJEMPLOS de buenas primeras preguntas:
"Para comenzar, me encantaría conocerte mejor. Cuéntame sobre tu trayectoria profesional y qué te ha traído hasta este punto."
"Empecemos por ti. ¿Podrías compartirme tu experiencia y qué es lo que más te apasiona de tu área?"

AHORA genera TU primera pregunta siguiendo este estilo:`

      const response = await this.makeRequest(prompt)
      const message = this.extractTextFromResponse(response).trim()

      // Validación para evitar respuestas problemáticas
      if (message.toLowerCase().includes('model') || message.length < 15) {
        logger.warn('⚠️ Primera pregunta problemática, usando fallback')
        return "Para comenzar, me encantaría conocerte mejor. Cuéntame sobre tu trayectoria profesional, las experiencias que te han marcado y qué es lo que más te apasiona de tu área de trabajo."
      }

      return message
    } catch (error) {
      logger.error('Error generating first question:', error)
      return "Para comenzar, me encantaría conocerte mejor. Cuéntame sobre tu trayectoria profesional, las experiencias que te han marcado y qué es lo que más te apasiona de tu área de trabajo."
    }
  }

  /**
   * NUEVO: Zavi analiza la respuesta y genera comentario + siguiente acción
   * GEMINI ES EL PROTAGONISTA - Fallback solo en caso de error real
   */
  async analyzeAndRespond(context: {
    userResponse: string
    currentQuestion: string
    questionNumber: number
    totalQuestions: number
    conversationHistory: Array<{ role: 'assistant' | 'user', content: string }>
  }): Promise<{
    comment: string
    shouldAskFollowUp: boolean
    followUpQuestion?: string
    shouldContinueToNext: boolean
    nextQuestion?: string
    reasoning: string
  }> {
    if (!this.apiKey) {
      logger.error('❌ No API key configurada')
      return this.generateSimpleResponse(context)
    }

    // INTENTAR MÚLTIPLES VECES CON GEMINI antes de rendirse
    let lastError: any = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        logger.info(`🎯 Intento ${attempt}/3: Usando Gemini para análisis completo...`)
        const prompt = this.buildAnalyzeAndRespondPrompt(context)
        const response = await this.makeRequest(prompt)
        const text = this.extractTextFromResponse(response)
        const parsed = this.parseAnalyzeAndRespondResponse(text)

        // Validar que la respuesta sea coherente
        if (!parsed.comment || parsed.comment.length < 10) {
          throw new Error('Respuesta de Gemini incompleta')
        }

        // 🚨 VALIDACIÓN FORZADA: Si estamos en pregunta 5 y Gemini generó nextQuestion, ELIMINARLO
        if (context.questionNumber === 5 && parsed.nextQuestion && parsed.nextQuestion !== 'null') {
          logger.warn('⚠️⚠️⚠️ GEMINI IGNORÓ INSTRUCCIONES - Generó nextQuestion en pregunta 5')
          logger.warn('🔧 FORZANDO nextQuestion = null')
          parsed.nextQuestion = null
          parsed.reasoning = 'última pregunta (forzado)'
        }

        logger.info('✅ Gemini respondió exitosamente')
        return parsed

      } catch (error) {
        lastError = error
        logger.error(`❌ Intento ${attempt}/3 falló:`, error)

        // Si no es el último intento, esperar un poco antes de reintentar
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
    }

    // Solo después de 3 intentos fallidos, usar fallback
    logger.error('❌❌❌ GEMINI FALLÓ DESPUÉS DE 3 INTENTOS ❌❌❌')
    logger.error('Último error:', lastError)
    return this.generateSimpleResponse(context)
  }

  /**
   * Sistema de emergencia MÍNIMO - Solo se usa cuando Gemini realmente falla
   * NO debe competir con Gemini, solo proporcionar un fallback básico
   */
  private generateSimpleResponse(context: any): any {
    logger.error('⚠️⚠️⚠️ USANDO FALLBACK DE EMERGENCIA - GEMINI FALLÓ ⚠️⚠️⚠️')

    // Fallback ultra-básico solo para que la entrevista no se rompa
    return {
      comment: "Entiendo. Cuéntame más sobre eso.",
      shouldAskFollowUp: false,
      followUpQuestion: null,
      shouldContinueToNext: true,
      nextQuestion: "¿Podrías contarme más sobre tu experiencia profesional?",
      reasoning: "fallback de emergencia - Gemini falló"
    }
  }

  private buildAnalyzeAndRespondPrompt(context: any): string {
    const conversationSummary = context.conversationHistory
      .slice(-6) // Últimos 6 mensajes para contexto
      .map((msg: any) => `${msg.role === 'assistant' ? 'Zavi' : 'Candidato'}: ${msg.content}`)
      .join('\n')

    // Advertencia crítica si estamos en pregunta 4+
    const criticalWarning = context.questionNumber >= 4
      ? `\n⚠️ CRÍTICO: Estás en pregunta ${context.questionNumber} de ${context.totalQuestions}. PROHIBIDO hacer followUpQuestion. SOLO genera nextQuestion y deja que el usuario responda.`
      : ''

    // Advertencia especial para pregunta 5 - ULTRA SIMPLIFICADA
    const question5Warning = context.questionNumber === 5
      ? `\n
═══════════════════════════════════════════════════════════════
🚨 PREGUNTA 5 - ÚLTIMA PREGUNTA - NO GENERES MÁS PREGUNTAS 🚨
═══════════════════════════════════════════════════════════════

REGLA ÚNICA PARA PREGUNTA 5:

"nextQuestion" DEBE SER null (NO escribas ninguna pregunta)

FORMATO OBLIGATORIO:
{
  "comment": "comentario sobre lo que dijo (30-50 palabras)",
  "shouldAskFollowUp": false,
  "followUpQuestion": null,
  "shouldContinueToNext": true,
  "nextQuestion": null,
  "reasoning": "última pregunta"
}

PROHIBIDO: "¿Cuál consideras...", "¿Podrías...", "Ahora...", "Para finalizar..."
CORRECTO: null

═══════════════════════════════════════════════════════════════`
      : ''

    return `Eres Zavi, una entrevistadora virtual profesional y empática.

CONTEXTO DE LA CONVERSACIÓN:
${conversationSummary}

RESPUESTA ACTUAL DEL CANDIDATO: "${context.userResponse}"
PREGUNTA NÚMERO: ${context.questionNumber} de ${context.totalQuestions}${criticalWarning}${question5Warning}

INSTRUCCIONES CLARAS:
1. Lee y analiza específicamente la respuesta del candidato
2. Genera un comentario empático que muestre que entendiste su respuesta
3. Menciona algo específico que el candidato dijo (proyectos, tecnologías, experiencias)
4. Usa frases como "veo que...", "me parece interesante...", "qué bueno que..."
5. Sé conversacional y natural, como una entrevistadora real
6. ⚠️ NUNCA hagas pregunta de seguimiento (shouldAskFollowUp SIEMPRE debe ser false)
7. ⚠️ SIEMPRE espera que el usuario responda antes de continuar - UNA sola pregunta a la vez
8. ⚠️ Si estás en pregunta 5, tu "comment" SOLO comenta la respuesta actual - NO invites a hacer preguntas, NO des gracias, NO digas "hemos terminado"

FORMATO DE RESPUESTA - SOLO JSON:

🚨 SI ESTÁS EN PREGUNTA 5 (ÚLTIMA) - nextQuestion DEBE SER null:
{
  "comment": "Me gusta cómo combinas documentación oficial con videos prácticos para mantenerte actualizado.",
  "shouldAskFollowUp": false,
  "followUpQuestion": null,
  "shouldContinueToNext": true,
  "nextQuestion": null,
  "reasoning": "última pregunta completada"
}

❌ RESPUESTA INCORRECTA PARA PREGUNTA 5:
{
  "comment": "Interesante.",
  "nextQuestion": "Ahora, pensando en tu experiencia..."  <-- ¡PROHIBIDO!
}

❌ TAMBIÉN INCORRECTO:
{
  "comment": "Gracias por compartir. Hemos cubierto todos los puntos.",
  "nextQuestion": null
}

✅ RESPUESTA CORRECTA PARA PREGUNTA 5:
{
  "comment": "Veo que priorizas fuentes oficiales y la práctica constante. Me parece un enfoque muy sólido.",
  "shouldAskFollowUp": false,
  "followUpQuestion": null,
  "shouldContinueToNext": true,
  "nextQuestion": null,
  "reasoning": "última pregunta completada"
}

SI ESTÁS EN PREGUNTA 1-4 (nextQuestion es una nueva pregunta):
{
  "comment": "comentario específico sobre lo que dijo el candidato (40-60 palabras)",
  "shouldAskFollowUp": false,
  "followUpQuestion": null,
  "shouldContinueToNext": true,
  "nextQuestion": "siguiente pregunta relevante para entrevista",
  "reasoning": "continuar con nueva pregunta"
}

EJEMPLOS DE BUENOS COMENTARIOS:
- Si habla de SAP: "Qué interesante tu experiencia con integraciones SAP, es un sistema muy complejo"
- Si habla de migración: "Me gusta cómo identificaste los problemas en el sistema anterior y propusiste una solución"
- Si habla de datos: "Veo que tienes buen ojo para la calidad de datos, eso es muy valioso"

IMPORTANTE: Responde SOLO con el JSON, sin markdown ni explicaciones.`
  }

  private parseAnalyzeAndRespondResponse(response: string): any {
    try {
      logger.info('🔍 Parseando respuesta de Gemini...')
      logger.info('📝 Respuesta completa (primeros 300 chars):', response.substring(0, 300))

      // Limpiar la respuesta más agresivamente
      let cleanedResponse = response
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .replace(/^\s*[\r\n]+/gm, '') // Remover líneas vacías
        .replace(/^[^{]*/g, '') // Remover todo antes del primer {
        .replace(/[^}]*$/g, '') // Remover todo después del último }
        .trim()

      // Buscar el JSON de forma más flexible
      let jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        // Buscar de forma más amplia
        jsonMatch = response.match(/\{[^}]*"comment"[^}]*\}/gi)
      }

      if (jsonMatch) {
        const jsonStr = jsonMatch[0]
        logger.info('✅ JSON encontrado:', jsonStr.substring(0, 200) + '...')

        try {
          const parsed = JSON.parse(jsonStr)

          // Validar que tenemos los campos esenciales
          if (!parsed.comment && !parsed.nextQuestion) {
            throw new Error('JSON sin campos esenciales')
          }

          // Limpiar y validar los campos
          if (parsed.comment) {
            let cleanedComment = parsed.comment
              .replace(/[\{\}]/g, '') // Remover llaves
              .replace(/^["']+|["']+$/g, '') // Remover comillas al inicio/final
              .replace(/\n/g, ' ') // Remover saltos de línea
              .replace(/^comment:\s*/i, '') // Remover prefijo "comment:"
              .trim()

            // DETECTAR si el comment contiene TODO el JSON (Gemini lo puso mal)
            if (cleanedComment.includes('"comment"') ||
              cleanedComment.includes('"nextQuestion"') ||
              cleanedComment.includes('"shouldAskFollowUp"')) {
              logger.warn('⚠️ Comment contiene JSON completo, rechazando:', cleanedComment.substring(0, 100))
              throw new Error('Comment contiene JSON - respuesta malformada')
            }

            parsed.comment = cleanedComment

            // DETECTAR RESPUESTAS INCOMPLETAS - si termina cortada, rechazar
            if (parsed.comment.endsWith('algo') ||
              parsed.comment.endsWith('de') ||
              parsed.comment.endsWith('la') ||
              parsed.comment.endsWith('el') ||
              parsed.comment.endsWith('si') ||
              parsed.comment.endsWith('un') ||
              parsed.comment.endsWith('una') ||
              parsed.comment.endsWith('en') ||
              parsed.comment.endsWith('con') ||
              parsed.comment.endsWith('para') ||
              parsed.comment.length < 30) {
              logger.warn('⚠️ Comentario incompleto detectado:', parsed.comment)
              throw new Error('Respuesta incompleta de Gemini')
            }
          }

          if (parsed.nextQuestion) {
            parsed.nextQuestion = parsed.nextQuestion
              .replace(/[\{\}]/g, '')
              .replace(/^["']+|["']+$/g, '')
              .trim()

            // Validar que la pregunta esté completa
            if (parsed.nextQuestion.length < 20) {
              logger.warn('⚠️ Pregunta incompleta detectada:', parsed.nextQuestion)
              throw new Error('Pregunta incompleta de Gemini')
            }
          }

          // Asegurar que tenemos todos los campos necesarios
          parsed.shouldAskFollowUp = parsed.shouldAskFollowUp || false
          parsed.followUpQuestion = parsed.followUpQuestion || null
          parsed.shouldContinueToNext = parsed.shouldContinueToNext !== false
          parsed.reasoning = parsed.reasoning || "análisis de Gemini"

          logger.info('✅ Respuesta parseada exitosamente:', {
            comment: parsed.comment?.substring(0, 50) + '...',
            hasNextQuestion: !!parsed.nextQuestion
          })

          return parsed

        } catch (parseError) {
          logger.error('❌ Error parseando JSON:', parseError)
          throw parseError
        }
      }

      // Si no encontramos JSON, intentar extraer datos de la respuesta conversacional
      logger.warn('⚠️ No se encontró JSON, intentando extraer datos conversacionales...')

      const conversationalResponse = this.convertConversationalToJSON(response)
      if (conversationalResponse) {
        logger.info('✅ Respuesta conversacional convertida a JSON')
        return conversationalResponse
      }

      logger.error('❌ No se encontró JSON válido ni contenido conversacional útil')
      throw new Error('No JSON found')

    } catch (error) {
      logger.error('❌ Error en parseAnalyzeAndRespondResponse:', error)
      throw error
    }
  }

  /**
   * Convierte una respuesta conversacional de Gemini a nuestro formato JSON
   */
  private convertConversationalToJSON(response: string): any | null {
    try {
      if (!response || response.length < 10) {
        return null
      }

      // Extraer comentario inteligente de la respuesta
      let comment = response.trim()

      // Limpiar texto común de respuestas de IA
      comment = comment
        .replace(/^(Como|Eres|Soy|Zavi)/i, '')
        .replace(/entrevistadora/gi, '')
        .replace(/virtual/gi, '')
        .replace(/profesional/gi, '')
        .trim()

      // Si es muy largo, tomar las primeras oraciones
      const sentences = comment.split(/[.!?]+/)
      if (sentences.length > 2) {
        comment = sentences.slice(0, 2).join('. ').trim() + '.'
      }

      // Si está vacío o es muy corto, usar fallback
      if (comment.length < 10) {
        comment = "Muy interesante tu experiencia."
      }

      // Generar pregunta de seguimiento básica
      const nextQuestion = "¿Podrías contarme más detalles sobre ese proyecto que mencionaste?"

      return {
        comment: comment,
        shouldAskFollowUp: false,
        followUpQuestion: null,
        shouldContinueToNext: true,
        nextQuestion: nextQuestion,
        reasoning: "Respuesta conversacional convertida"
      }

    } catch (error) {
      logger.error('❌ Error convirtiendo respuesta conversacional:', error)
      return null
    }
  }

  /**
   * Genera una respuesta de fallback cuando Gemini no devuelve JSON válido
   */
  private generateFallbackResponse(originalResponse: string): any {
    // Analizar la respuesta para extraer comentario relevante
    const comment = this.extractCommentFromResponse(originalResponse)

    return {
      comment: comment,
      shouldAskFollowUp: false,
      followUpQuestion: null,
      shouldContinueToNext: true,
      nextQuestion: "¿Podrías contarme más sobre tu experiencia trabajando en proyectos colaborativos y cómo manejas los desafíos técnicos?",
      reasoning: "Fallback debido a respuesta no estructurada"
    }
  }

  /**
   * Extrae un comentario relevante de una respuesta no estructurada
   */
  private extractCommentFromResponse(response: string): string {
    // Si la respuesta tiene contenido útil, usarla
    if (response && response.length > 20) {
      // Limpiar y tomar una parte relevante
      const cleaned = response
        .replace(/```json|```/g, '')
        .replace(/^\{|\}$/g, '')
        .replace(/"/g, '')
        .replace(/comment:\s*/i, '')
        .trim()
        .substring(0, 150)

      if (cleaned.length > 20 && !cleaned.includes('shouldAskFollowUp') && !cleaned.includes('nextQuestion')) {
        return `Entiendo tu punto de vista. ${cleaned.split('.')[0]}.`
      }
    }

    // Fallback genérico más profesional
    return "Muy interesante lo que comentas. Me parece valioso todo lo que has compartido hasta el momento."
  }



  /**
   * NUEVO: Zavi responde preguntas del candidato
   */
  async answerCandidateQuestion(question: string, context: {
    conversationHistory: Array<{ role: 'assistant' | 'user', content: string }>
  }): Promise<string> {
    if (!this.apiKey) {
      return "Esa es una excelente pregunta. En nuestra empresa valoramos el desarrollo profesional y ofrecemos oportunidades de crecimiento."
    }

    try {
      const conversationContext = context.conversationHistory
        .slice(-6) // Últimos 6 mensajes
        .map(msg => `${msg.role === 'assistant' ? 'Zavi' : 'Candidato'}: ${msg.content}`)
        .join('\n')

      const prompt = `Eres Zavi, una entrevistadora virtual experta de una empresa innovadora.

CONTEXTO RECIENTE:
${conversationContext}

PREGUNTA DEL CANDIDATO: "${question}"

TAREA: Responder la pregunta del candidato de manera profesional, completa y útil.

INFORMACIÓN SOBRE LA EMPRESA/POSICIÓN:
- Empresa innovadora en crecimiento
- Se valora la innovación, creatividad y el aprendizaje continuo
- Ambiente colaborativo, inclusivo y flexible
- Múltiples oportunidades de desarrollo profesional y capacitación
- Proyectos desafiantes y tecnología de vanguardia
- Trabajo híbrido/remoto disponible
- Cultura de feedback y mentoría
- Beneficios competitivos y balance vida-trabajo

INSTRUCCIONES CRÍTICAS:
- Responde de manera honesta, profesional y COMPLETA (60-80 palabras MÍNIMO)
- Tu respuesta DEBE terminar con un punto final (.) - NO la cortes a la mitad
- Sé específica y detallada en tu respuesta
- Si no tienes información exacta, menciona que el equipo de RRHH puede proporcionar más detalles
- Usa un tono conversacional y cercano
- Demuestra entusiasmo por la empresa y oportunidad
- IMPORTANTE: Completa todas las oraciones, NO dejes frases cortadas

Genera SOLO la respuesta completa (mínimo 60 palabras):`

      const response = await this.makeRequest(prompt)
      const answer = this.extractTextFromResponse(response).trim()

      // Validar que la respuesta esté completa (no termine con preposición o palabra cortada)
      if (answer.length < 50 ||
        answer.endsWith('de') ||
        answer.endsWith('la') ||
        answer.endsWith('el') ||
        answer.endsWith('en') ||
        !answer.endsWith('.') && !answer.endsWith('!') && !answer.endsWith('?')) {
        logger.warn('⚠️ Respuesta incompleta, usando fallback:', answer)
        return "Esa es una excelente pregunta. En este rol, tendrás la oportunidad de trabajar en proyectos innovadores con tecnología de vanguardia. Valoramos el desarrollo profesional continuo y ofrecemos un ambiente colaborativo donde podrás crecer. El equipo de RRHH podrá darte más detalles específicos sobre beneficios y compensación. ¿Tienes alguna otra pregunta?"
      }

      return answer
    } catch (error) {
      logger.error('Error answering candidate question:', error)
      return "Esa es una excelente pregunta. En nuestra empresa valoramos el desarrollo profesional y ofrecemos oportunidades de crecimiento."
    }
  }

  /**
   * NUEVO: Zavi genera mensaje de transición a fase de preguntas del candidato
   */
  async generateTransitionToQuestionsPhase(context: {
    conversationHistory: Array<{ role: 'assistant' | 'user', content: string }>
  }): Promise<string> {
    if (!this.apiKey) {
      return "Perfecto, hemos terminado con mis preguntas. Ahora es tu turno, ¿tienes alguna pregunta para mí sobre la posición o la empresa?"
    }

    try {
      const prompt = `Eres Zavi, una entrevistadora virtual que acaba de terminar de hacer 5 preguntas al candidato.

TAREA: Hacer la transición a la fase donde el candidato puede hacerte preguntas.

INSTRUCCIONES:
- Felicita brevemente al candidato por completar las preguntas
- Invita al candidato a hacer preguntas sobre la empresa/posición
- Sé cálida y abierta
- Máximo 3 oraciones

Genera SOLO el mensaje de transición:`

      const response = await this.makeRequest(prompt)
      return this.extractTextFromResponse(response).trim()
    } catch (error) {
      logger.error('Error generating transition:', error)
      return "Perfecto, hemos terminado con mis preguntas. Ahora es tu turno, ¿tienes alguna pregunta para mí sobre la posición o la empresa?"
    }
  }

  /**
   * NUEVO: Zavi se despide
   */
  async generateFarewellMessage(context: {
    conversationHistory: Array<{ role: 'assistant' | 'user', content: string }>
  }): Promise<string> {
    if (!this.apiKey) {
      return "¡Excelente! Muchas gracias por tu tiempo y tus respuestas. Fue un placer conversar contigo. Procesaré toda la información para generar tu evaluación personalizada. ¡Mucho éxito!"
    }

    try {
      const prompt = `Eres Zavi, una entrevistadora virtual que está terminando una entrevista exitosa.

TAREA: Despedirte del candidato de manera profesional y cálida.

INSTRUCCIONES:
- Agradece el tiempo y participación
- Menciona que generarás una evaluación
- Sé positiva y motivadora
- Máximo 3 oraciones

Genera SOLO el mensaje de despedida:`

      const response = await this.makeRequest(prompt)
      return this.extractTextFromResponse(response).trim()
    } catch (error) {
      logger.error('Error generating farewell:', error)
      return "¡Excelente! Muchas gracias por tu tiempo y tus respuestas. Fue un placer conversar contigo. Procesaré toda la información para generar tu evaluación personalizada. ¡Mucho éxito!"
    }
  }
}

// Instancia singleton
export const geminiService = new GeminiService()