-- =====================================================
-- SCRIPT COMPLETO POSTGRESQL - INTERVIEW-AI DATABASE
-- =====================================================

-- CREAR BASE DE DATOS
CREATE DATABASE interview_ai_db
    WITH 
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.utf8'
    LC_CTYPE = 'en_US.utf8'
    TABLESPACE = pg_default
    CONNECTION LIMIT = -1;

-- CONECTAR A LA BASE DE DATOS
\c interview_ai_db;

-- CREAR EXTENSIONES NECESARIAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- CREAR ENUMS
-- =====================================================

CREATE TYPE user_role AS ENUM ('USER', 'ADMIN');
CREATE TYPE interview_status AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE interview_type AS ENUM ('TECHNICAL', 'BEHAVIORAL', 'MIXED', 'CUSTOM');
CREATE TYPE question_category AS ENUM ('TECHNICAL_SKILLS', 'PROBLEM_SOLVING', 'COMMUNICATION', 'LEADERSHIP', 'TEAMWORK', 'ADAPTABILITY', 'EXPERIENCE', 'BEHAVIORAL', 'PERSONAL', 'MOTIVATION', 'CUSTOM');
CREATE TYPE question_difficulty AS ENUM ('EASY', 'MEDIUM', 'HARD');
CREATE TYPE notification_type AS ENUM ('INTERVIEW_COMPLETED', 'FEEDBACK_READY', 'REMINDER', 'ACHIEVEMENT', 'SYSTEM');
CREATE TYPE education_level AS ENUM ('Secundaria', 'Técnico', 'Universitario', 'Postgrado', 'Doctorado');
CREATE TYPE education_status AS ENUM ('En curso', 'Completado', 'Abandonado');
CREATE TYPE gender_type AS ENUM ('Masculino', 'Femenino', 'Otro', 'Prefiero no decir');
CREATE TYPE work_mode AS ENUM ('Remoto', 'Presencial', 'Híbrido');
CREATE TYPE availability_type AS ENUM ('Inmediata', '2 semanas', '1 mes', '2 meses', 'Más de 2 meses');
CREATE TYPE voice_provider AS ENUM ('azure', 'google', 'elevenlabs');

-- =====================================================
-- TABLAS
-- =====================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role user_role DEFAULT 'USER',
    avatar TEXT,
    phone VARCHAR(20),
    birth_date DATE,
    gender gender_type,
    city VARCHAR(100),
    country VARCHAR(100),
    education_level education_level,
    institution VARCHAR(200),
    field_of_study VARCHAR(200),
    education_status education_status,
    certifications TEXT,
    currently_working BOOLEAN DEFAULT FALSE,
    current_position VARCHAR(200),
    current_company VARCHAR(200),
    years_of_experience VARCHAR(50),
    previous_positions TEXT,
    skills TEXT,
    languages TEXT,
    desired_position VARCHAR(200),
    desired_salary VARCHAR(100),
    availability availability_type,
    willing_to_relocate BOOLEAN DEFAULT FALSE,
    work_mode work_mode,
    about_me TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL,
    language VARCHAR(10) DEFAULT 'es',
    preferred_interview_duration INTEGER DEFAULT 30,
    enable_notifications BOOLEAN DEFAULT TRUE,
    avatar_enabled BOOLEAN DEFAULT TRUE,
    avatar_id VARCHAR(100),
    voice_provider voice_provider DEFAULT 'azure',
    voice_settings JSONB,
    audio_settings JSONB,
    save_recordings BOOLEAN DEFAULT TRUE,
    share_data_for_improvement BOOLEAN DEFAULT FALSE,
    allow_analytics BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE interviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status interview_status DEFAULT 'DRAFT',
    type interview_type DEFAULT 'MIXED',
    duration INTEGER NOT NULL DEFAULT 0,
    enable_avatar BOOLEAN DEFAULT TRUE,
    enable_recording BOOLEAN DEFAULT TRUE,
    language VARCHAR(10) DEFAULT 'es',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    text TEXT NOT NULL,
    category question_category NOT NULL,
    difficulty question_difficulty NOT NULL,
    expected_duration INTEGER NOT NULL,
    follow_up_questions TEXT,
    tags TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE interview_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interview_id UUID NOT NULL,
    question_id UUID NOT NULL,
    order_index INTEGER NOT NULL,
    is_answered BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    UNIQUE(interview_id, question_id)
);

CREATE TABLE interview_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interview_id UUID NOT NULL,
    question_id UUID NOT NULL,
    audio_url TEXT,
    transcription TEXT NOT NULL,
    duration INTEGER NOT NULL,
    confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE interview_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interview_id UUID UNIQUE NOT NULL,
    overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
    strengths TEXT,
    areas_for_improvement TEXT,
    recommendations TEXT,
    detailed_feedback JSONB,
    ai_model VARCHAR(50) NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    type notification_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    action_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token TEXT UNIQUE NOT NULL,
    user_id UUID NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================================================
-- ÍNDICES
-- =====================================================

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_user_settings_user_id ON user_settings(user_id);
CREATE INDEX idx_interviews_user_id ON interviews(user_id);
CREATE INDEX idx_interviews_status ON interviews(status);
CREATE INDEX idx_interviews_created_at ON interviews(created_at);
CREATE INDEX idx_questions_category ON questions(category);
CREATE INDEX idx_questions_difficulty ON questions(difficulty);
CREATE INDEX idx_questions_is_active ON questions(is_active);
CREATE INDEX idx_interview_questions_interview_id ON interview_questions(interview_id);
CREATE INDEX idx_interview_questions_question_id ON interview_questions(question_id);
CREATE INDEX idx_interview_responses_interview_id ON interview_responses(interview_id);
CREATE INDEX idx_interview_responses_question_id ON interview_responses(question_id);
CREATE INDEX idx_interview_feedback_interview_id ON interview_feedback(interview_id);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);

-- =====================================================
-- TRIGGERS PARA UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_interviews_updated_at BEFORE UPDATE ON interviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_questions_updated_at BEFORE UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FUNCIONES ÚTILES
-- =====================================================

-- Función para limpiar tokens expirados
CREATE OR REPLACE FUNCTION clean_expired_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener estadísticas de usuario
CREATE OR REPLACE FUNCTION get_user_stats(user_uuid UUID)
RETURNS TABLE(
    total_interviews INTEGER,
    completed_interviews INTEGER,
    avg_score DECIMAL,
    last_interview_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_interviews,
        COUNT(CASE WHEN i.status = 'COMPLETED' THEN 1 END)::INTEGER as completed_interviews,
        AVG(f.overall_score)::DECIMAL as avg_score,
        MAX(i.completed_at) as last_interview_date
    FROM interviews i
    LEFT JOIN interview_feedback f ON i.id = f.interview_id
    WHERE i.user_id = user_uuid;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- DATOS INICIALES
-- =====================================================

-- Usuario administrador
INSERT INTO users (
    id, email, password, first_name, last_name, role,
    phone, birth_date, gender, city, country,
    education_level, institution, field_of_study, education_status,
    currently_working, current_position, current_company, years_of_experience,
    skills, languages, desired_position, desired_salary, availability, work_mode, about_me
) VALUES (
    uuid_generate_v4(),
    'admin@interview-ai.com',
    crypt('admin123', gen_salt('bf')),
    'Admin',
    'Sistema',
    'ADMIN',
    '+1234567890',
    '1985-01-01',
    'Prefiero no decir',
    'Madrid',
    'España',
    'Universitario',
    'Universidad Técnica',
    'Ingeniería en Sistemas',
    'Completado',
    TRUE,
    'Administrador de Sistemas',
    'Interview AI',
    'Más de 10 años',
    'PostgreSQL|Node.js|React|TypeScript|Python|DevOps',
    'Español|Inglés|Francés',
    'CTO',
    'Confidencial',
    'Inmediata',
    'Remoto',
    'Administrador del sistema Interview AI con experiencia en desarrollo full-stack y arquitectura de sistemas.'
);

-- Usuario de prueba
INSERT INTO users (
    id, email, password, first_name, last_name, role,
    phone, birth_date, gender, city, country,
    education_level, institution, field_of_study, education_status,
    currently_working, current_position, current_company, years_of_experience,
    skills, languages, desired_position, desired_salary, availability, work_mode, about_me
) VALUES (
    uuid_generate_v4(),
    'test@example.com',
    crypt('123456', gen_salt('bf')),
    'Usuario',
    'Prueba',
    'USER',
    '+1234567890',
    '1990-01-01',
    'Prefiero no decir',
    'Barcelona',
    'España',
    'Universitario',
    'Universidad de Barcelona',
    'Ingeniería Informática',
    'Completado',
    TRUE,
    'Desarrollador Full-Stack',
    'Tech Company',
    '3-5 años',
    'JavaScript|TypeScript|React|Node.js|PostgreSQL|MongoDB',
    'Español|Inglés',
    'Senior Developer',
    '45000-55000',
    'Inmediata',
    'Remoto',
    'Desarrollador con experiencia en tecnologías web modernas y metodologías ágiles.'
);

-- Configuraciones para usuarios
INSERT INTO user_settings (user_id, language, preferred_interview_duration, enable_notifications, avatar_enabled, voice_provider, save_recordings, share_data_for_improvement, allow_analytics)
SELECT id, 'es', 30, TRUE, TRUE, 'azure', TRUE, FALSE, TRUE
FROM users;

-- Preguntas de ejemplo por categoría
INSERT INTO questions (text, category, difficulty, expected_duration, tags) VALUES
-- TECHNICAL_SKILLS
('Explica las diferencias entre var, let y const en JavaScript', 'TECHNICAL_SKILLS', 'MEDIUM', 180, 'javascript,variables,programación'),
('¿Qué es la normalización de bases de datos y por qué es importante?', 'TECHNICAL_SKILLS', 'HARD', 240, 'base de datos,normalización,sql'),
('Describe el patrón MVC y sus ventajas', 'TECHNICAL_SKILLS', 'MEDIUM', 200, 'arquitectura,mvc,patrones'),

-- BEHAVIORAL
('Cuéntame sobre una vez que tuviste que trabajar bajo mucha presión', 'BEHAVIORAL', 'MEDIUM', 120, 'presión,estrés,manejo'),
('Describe una situación donde tuviste un conflicto con un compañero de trabajo', 'BEHAVIORAL', 'HARD', 150, 'conflicto,trabajo en equipo,resolución'),
('¿Cómo manejas las críticas constructivas?', 'BEHAVIORAL', 'EASY', 90, 'críticas,feedback,crecimiento'),

-- EXPERIENCE
('Cuéntame sobre tu experiencia laboral más relevante para este puesto', 'EXPERIENCE', 'MEDIUM', 180, 'experiencia,laboral,relevante'),
('¿Cuál ha sido tu mayor logro profesional?', 'EXPERIENCE', 'MEDIUM', 120, 'logros,profesional,éxito'),
('Describe un proyecto desafiante en el que hayas trabajado', 'EXPERIENCE', 'HARD', 200, 'proyecto,desafío,experiencia'),

-- PERSONAL
('¿Cuáles consideras que son tus principales fortalezas?', 'PERSONAL', 'EASY', 90, 'fortalezas,habilidades,personal'),
('¿En qué áreas te gustaría mejorar profesionalmente?', 'PERSONAL', 'MEDIUM', 100, 'mejora,desarrollo,crecimiento'),
('¿Cómo te describirían tus colegas?', 'PERSONAL', 'EASY', 80, 'percepción,colegas,personalidad'),

-- MOTIVATION
('¿Por qué quieres trabajar en esta empresa?', 'MOTIVATION', 'MEDIUM', 120, 'motivación,empresa,interés'),
('¿Cuáles son tus objetivos profesionales a largo plazo?', 'MOTIVATION', 'MEDIUM', 150, 'objetivos,carrera,futuro'),
('¿Qué te motiva en el trabajo?', 'MOTIVATION', 'EASY', 90, 'motivación,trabajo,pasión');

-- =====================================================
-- ROLES Y PERMISOS
-- =====================================================

-- Crear rol para la aplicación
CREATE ROLE interview_ai_app WITH LOGIN PASSWORD 'app_password_here';

-- Otorgar permisos necesarios
GRANT CONNECT ON DATABASE interview_ai_db TO interview_ai_app;
GRANT USAGE ON SCHEMA public TO interview_ai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO interview_ai_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO interview_ai_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO interview_ai_app;

-- =====================================================
-- VISTAS ÚTILES
-- =====================================================

-- Vista para estadísticas de entrevistas
CREATE VIEW interview_stats AS
SELECT 
    u.id as user_id,
    u.first_name,
    u.last_name,
    u.email,
    COUNT(i.id) as total_interviews,
    COUNT(CASE WHEN i.status = 'COMPLETED' THEN 1 END) as completed_interviews,
    AVG(f.overall_score)::DECIMAL(5,2) as avg_score,
    MAX(i.completed_at) as last_interview_date
FROM users u
LEFT JOIN interviews i ON u.id = i.user_id
LEFT JOIN interview_feedback f ON i.id = f.interview_id
GROUP BY u.id, u.first_name, u.last_name, u.email;

-- Vista para preguntas activas por categoría
CREATE VIEW active_questions_by_category AS
SELECT 
    category,
    difficulty,
    COUNT(*) as question_count,
    AVG(expected_duration) as avg_duration
FROM questions 
WHERE is_active = TRUE
GROUP BY category, difficulty
ORDER BY category, difficulty;

-- =====================================================
-- PROCEDIMIENTOS ALMACENADOS
-- =====================================================

-- Procedimiento para crear una entrevista completa con preguntas
CREATE OR REPLACE FUNCTION create_interview_with_questions(
    p_user_id UUID,
    p_title VARCHAR(255),
    p_description TEXT DEFAULT NULL,
    p_question_categories question_category[] DEFAULT ARRAY['BEHAVIORAL', 'TECHNICAL_SKILLS', 'EXPERIENCE'],
    p_questions_per_category INTEGER DEFAULT 2
)
RETURNS UUID AS $$
DECLARE
    new_interview_id UUID;
    category question_category;
    question_record RECORD;
    question_order INTEGER := 1;
BEGIN
    -- Crear la entrevista
    INSERT INTO interviews (user_id, title, description, duration)
    VALUES (p_user_id, p_title, p_description, 0)
    RETURNING id INTO new_interview_id;
    
    -- Agregar preguntas por cada categoría
    FOREACH category IN ARRAY p_question_categories
    LOOP
        FOR question_record IN 
            SELECT id FROM questions 
            WHERE questions.category = category 
            AND is_active = TRUE 
            ORDER BY RANDOM() 
            LIMIT p_questions_per_category
        LOOP
            INSERT INTO interview_questions (interview_id, question_id, order_index)
            VALUES (new_interview_id, question_record.id, question_order);
            question_order := question_order + 1;
        END LOOP;
    END LOOP;
    
    RETURN new_interview_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- CONFIGURACIONES FINALES
-- =====================================================

-- Configurar timezone
SET timezone = 'UTC';

-- Configurar búsqueda de texto completo (opcional)
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX idx_questions_text_gin ON questions USING gin(text gin_trgm_ops);

COMMENT ON DATABASE interview_ai_db IS 'Base de datos para sistema de entrevistas con IA - Interview AI';
COMMENT ON TABLE users IS 'Usuarios del sistema con información completa de perfil';
COMMENT ON TABLE interviews IS 'Sesiones de entrevista realizadas por los usuarios';
COMMENT ON TABLE questions IS 'Banco de preguntas categorizadas para entrevistas';
COMMENT ON TABLE interview_feedback IS 'Retroalimentación generada por IA para entrevistas completadas';



