from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.modules.identity import service as idsvc
from app.modules.identity.models import User
from app.modules.academic import service as asvc
from app.modules.cms import service as cmsvc
from app.modules.cms.schemas import LandingSectionCreate, PublicationCreate, NewsCreate
from app.modules.academic.models import (
    CourseCategory,
    Course,
    Classroom,
    ContentUnit,
    Lesson,
    Resource,
    CourseEnrollment,
    ClassroomEnrollment,
    TeacherAssignment,
    Grade,
    Announcement,
    LessonProgress,
)
from app.modules.academic.schemas import (
    CategoryCreate,
    CourseCreate,
    ClassroomCreate,
    UnitCreate,
    LessonCreate,
    ResourceCreate,
    AnnouncementCreate,
    GradeCreate,
)

PASSWORD = "Demo1234!"


def seed():
    session: Session = SessionLocal()
    try:
        # roles
        idsvc.seed_roles(session)

        # users
        def mk_user(email, name, role, phone=None):
            existing = idsvc.get_user_by_email(session, email)
            if existing:
                return existing
            return idsvc.create_user(session, email=email, full_name=name, password=PASSWORD, role_code=role, phone=phone)

        admin = mk_user("admin@ecap.demo", "Administrador ECAP", "admin", "555-0001")
        editor1 = mk_user("editor@ecap.demo", "Editor Académico", "editor", "555-0002")
        editor2 = mk_user("editor2@ecap.demo", "Editor de Contenidos", "editor", "555-0003")

        teachers = [
            mk_user("maestro@ecap.demo", "Carlos Méndez", "teacher", "555-0101"),
            mk_user("maestra2@ecap.demo", "María López", "teacher", "555-0102"),
            mk_user("maestro3@ecap.demo", "José Ramírez", "teacher", "555-0103"),
            mk_user("maestra4@ecap.demo", "Ana García", "teacher", "555-0104"),
        ]

        students = []
        names = [
            "Juan Pérez", "María Fernández", "Luis Gómez", "Sofía Martínez", "Carlos Ruiz",
            "Ana Morales", "Diego Castro", "Valeria Díaz", "Pedro Soto", "Lucía Herrera",
            "Miguel Torres", "Camila Vargas", "Andrés Flores", "Isabella Reyes", "Sebastián Mora",
            "Gabriela Cruz", "Ricardo Vega", "Daniela Ortiz", "Fernando Jiménez", "Paula Rivas",
        ]
        for i, n in enumerate(names):
            students.append(mk_user(f"estudiante{i+1:02d}@ecap.demo", n, "student", f"555-2{i+1:03d}"))

        # categories
        cat_names = ["Tecnología", "Administración", "Idiomas", "Salud", "Derecho"]
        cats = {}
        for cn in cat_names:
            try:
                c = asvc.create_category(session, CategoryCreate(name=cn, description=f"Categoría {cn}"))
                cats[cn] = c
            except Exception:
                # already exists
                existing = [x for x in asvc.list_categories(session) if x.name == cn]
                if existing:
                    cats[cn] = existing[0]

        # courses
        course_defs = [
            ("CUR-101", "Introducción a la Programación", "Tecnología", "Básico", 40, "published"),
            ("CUR-102", "Gestión de Proyectos", "Administración", "Intermedio", 30, "published"),
            ("CUR-103", "Inglés Técnico", "Idiomas", "Básico", 60, "active"),
            ("CUR-104", "Primeros Auxilios", "Salud", "Básico", 20, "draft"),
            ("CUR-105", "Derecho Laboral", "Derecho", "Avanzado", 45, "published"),
        ]
        courses = []
        for code, name, cat, level, dur, status in course_defs:
            c = asvc.create_course(
                session,
                CourseCreate(
                    code=code,
                    name=name,
                    description=f"Curso de {name} para formación profesional.",
                    objectives="Desarrollar competencias clave en el área.",
                    category_id=cats[cat].id,
                    level=level,
                    duration_hours=dur,
                    status=status,
                    visibility="public" if status in ("published", "active") else "private",
                    start_date=date(2026, 1, 10),
                    end_date=date(2026, 6, 30),
                    responsible_teacher_id=teachers[len(courses) % len(teachers)].id,
                ),
                created_by=editor1.id,
            )
            courses.append(c)

        # classrooms (8)
        classrooms = []
        modalities = ["presencial", "virtual", "hibrida"]
        for i in range(8):
            course = courses[i % len(courses)]
            teacher = teachers[i % len(teachers)]
            cr = asvc.create_classroom(
                session,
                ClassroomCreate(
                    course_id=course.id,
                    name=f"Aula {i+1} - {course.name[:20]}",
                    description="Aula de capacitación.",
                    teacher_id=teacher.id,
                    start_date=date(2026, 2, 1),
                    end_date=date(2026, 5, 30),
                    max_capacity=25,
                    status="active",
                    modality=modalities[i % 3],
                    meeting_link="https://meet.example.com/aula" if modalities[i % 3] != "presencial" else None,
                ),
            )
            classrooms.append(cr)
            # teacher assignment
            asvc.assign_teacher(session, teacher.id, course_id=course.id, classroom_id=cr.id, role="primary")

        # content units & lessons
        video_urls = [
            "https://www.w3schools.com/html/mov_bbb.mp4",
            "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
        ]
        for ci, cr in enumerate(classrooms):
            for ui in range(2):
                unit = asvc.create_unit(
                    session,
                    UnitCreate(
                        classroom_id=cr.id,
                        title=f"Unidad {ui+1}: Fundamentos",
                        description="Contenidos básicos de la unidad.",
                        order_index=ui,
                        status="published",
                    ),
                )
                for li in range(3):
                    lesson = asvc.create_lesson(
                        session,
                        LessonCreate(
                            unit_id=unit.id,
                            title=f"Lección {li+1}: Tema {li+1}",
                            description="Descripción de la lección.",
                            content_type="video" if li == 0 else "text",
                            order_index=li,
                            status="published",
                        ),
                        author_id=teachers[ci % len(teachers)].id,
                    )
                    # resource video
                    if li == 0:
                        asvc.create_resource(
                            session,
                            ResourceCreate(
                                lesson_id=lesson.id,
                                title="Video de la lección",
                                type="video",
                                url=video_urls[li % len(video_urls)],
                                visibility="published",
                            ),
                            created_by=teachers[ci % len(teachers)].id,
                        )
                    asvc.create_resource(
                        session,
                        ResourceCreate(
                            lesson_id=lesson.id,
                            title="Material de apoyo (PDF)",
                            type="document",
                            url="https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
                            file_name="material.pdf",
                            file_size=120000,
                            visibility="published",
                        ),
                        created_by=teachers[ci % len(teachers)].id,
                    )

        # enrollments: assign students to courses/classrooms
        import random
        random.seed(42)
        for idx, st in enumerate(students):
            # each student 2 courses
            for c in random.sample(courses, 2):
                try:
                    asvc.enroll_course(session, st.id, c.id)
                except Exception:
                    pass
            # enroll in classrooms of those courses
            for cr in classrooms:
                course = next((c for c in courses if c.id == cr.course_id), None)
                # check if student enrolled in course
                ens = asvc.list_course_enrollments(session, course_id=cr.course_id, student_id=st.id)
                if ens:
                    try:
                        asvc.enroll_classroom(session, st.id, cr.id)
                    except Exception:
                        pass

        # grades
        for st in students[:12]:
            for cr in classrooms[:4]:
                # only if enrolled
                ce = asvc.list_classroom_enrollments(session, classroom_id=cr.id, student_id=st.id)
                if ce:
                    try:
                        asvc.create_grade(
                            session,
                            GradeCreate(
                                student_id=st.id,
                                classroom_id=cr.id,
                                assessment_name="Evaluación 1",
                                score=random.uniform(60, 98),
                                max_score=100,
                                observations="Buen desempeño.",
                            ),
                            graded_by=cr.teacher_id,
                        )
                    except Exception:
                        pass

        # announcements
        for cr in classrooms[:5]:
            asvc.create_announcement(
                session,
                AnnouncementCreate(
                    title="Bienvenidos al aula",
                    content="Les damos la bienvenida. Revisen los materiales publicados.",
                    classroom_id=cr.id,
                    pinned=True,
                ),
                author_id=cr.teacher_id,
            )
        asvc.create_announcement(
            session,
            AnnouncementCreate(
                title="Aviso general institucional",
                content="Inicio de período académico. Consulten sus cursos.",
                target_role=None,
                pinned=False,
            ),
            author_id=admin.id,
        )

        # progress sample
        for st in students[:5]:
            lessons = session.execute(__import__("sqlalchemy").select(Lesson)).scalars().all() if False else None
        from app.modules.academic.models import Lesson as LModel
        from sqlalchemy import select as sel
        all_lessons = list(session.execute(sel(LModel)).scalars().all())
        for st in students[:5]:
            for ls in all_lessons[:6]:
                try:
                    asvc.upsert_progress(session, st.id, ls.id, completed=True, progress_pct=100)
                except Exception:
                    pass

        # Landing content
        cmsvc.create_section(session, LandingSectionCreate(key="hero_title", title="Hero", content="“Las memorias, las palabras y el hablar en los grupos fueron nuestras medicinas.”", sort_order=0))
        cmsvc.create_section(session, LandingSectionCreate(key="hero_lead", title="Lead", content="Somos el Equipo de Estudios Comunitarios y Acción Psicosocial. Acompañamos a comunidades de Guatemala y compartimos guías, memorias y formación.", sort_order=1))
        cmsvc.create_section(session, LandingSectionCreate(key="quienes_somos", title="Quiénes somos", content="Somos el Equipo de Estudios Comunitarios y Acción Psicosocial (ECAP). Acompañamos a comunidades de Guatemala en procesos de memoria, salud mental comunitaria y acción psicosocial.", sort_order=2))
        cmsvc.create_section(session, LandingSectionCreate(key="aula_virtual", title="Aula Virtual", content="Accede a los cursos y materiales de formación de ECAP desde cualquier lugar.", sort_order=3))

        pub_defs = [
            ("Guía para acompañamiento psicosocial a mujeres en contextos de migración", "https://ecapguatemala.org.gt/wp-content/uploads/2022/05/Guia-Migracion-2.png", "https://ecapguatemala.org.gt/guia-para-acompanamiento-psicosocial-a-mujeres-en-contextos-de-migracion/"),
            ("Guía Gestión Integral del Riesgo", "https://ecapguatemala.org.gt/wp-content/uploads/2022/10/Portada-GuisGestionRiesgo.png", "https://ecapguatemala.org.gt/guia-gestion-integral-del-riesgo/"),
            ("Diagnóstico sobre desplazamiento forzado", "https://ecapguatemala.org.gt/wp-content/uploads/2022/08/Diagnostico-DesplazamientoForzado-2.png", "https://ecapguatemala.org.gt/diagnostico-sobre-desplazamiento-forzado/"),
            ("Guía básica sobre masculinidades", "https://ecapguatemala.org.gt/wp-content/uploads/2022/08/Guia-Masculinidades-2.png", "https://ecapguatemala.org.gt/guia-basica-sobre-masculinidades/"),
        ]
        for i,(t,img,url) in enumerate(pub_defs):
            cmsvc.create_publication(session, PublicationCreate(title=t, cover_image=img, url=url, sort_order=i))

        news_defs = [
            ("Inicio de período académico", "Comienza un nuevo ciclo de formación en el Aula Virtual de ECAP.", "https://ecapguatemala.org.gt/wp-content/uploads/2022/05/Portada-Memoria-Canchun.png"),
            ("Nueva guía publicada", "Disponible la guía de acompañamiento psicosocial a mujeres en contextos de migración.", "https://ecapguatemala.org.gt/wp-content/uploads/2022/05/Guia-Migracion-2.png"),
        ]
        for i,(t,s,img) in enumerate(news_defs):
            cmsvc.create_news(session, NewsCreate(title=t, summary=s, cover_image=img, sort_order=i))

        session.commit()
        print("Seed completado.")
        print(f"Password demo: {PASSWORD}")
    finally:
        session.close()


if __name__ == "__main__":
    seed()
