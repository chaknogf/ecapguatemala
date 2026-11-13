from __future__ import annotations

from datetime import datetime, date

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.core.types import TimestampMixin, UUID7, now_utc, uuid7


class CourseCategory(TimestampMixin, Base):
    __tablename__ = "course_category"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text)


class Course(TimestampMixin, Base):
    __tablename__ = "course"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    code: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    objectives: Mapped[str | None] = mapped_column(Text)
    cover_image: Mapped[str | None] = mapped_column(String(500))
    category_id: Mapped[object | None] = mapped_column(ForeignKey("course_category.id", ondelete="SET NULL"))
    duration_hours: Mapped[int | None] = mapped_column(Integer)
    level: Mapped[str | None] = mapped_column(String(40))
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="private")
    responsible_teacher_id: Mapped[object | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    created_by: Mapped[object | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("ix_course_status", "status"),)


class Classroom(TimestampMixin, Base):
    __tablename__ = "classroom"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    course_id: Mapped[object] = mapped_column(ForeignKey("course.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    teacher_id: Mapped[object | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    max_capacity: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")
    modality: Mapped[str | None] = mapped_column(String(30))
    meeting_link: Mapped[str | None] = mapped_column(String(500))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("ix_classroom_course", "course_id"),)


class ContentUnit(TimestampMixin, Base):
    __tablename__ = "content_unit"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    classroom_id: Mapped[object] = mapped_column(ForeignKey("classroom.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")

    __table_args__ = (Index("ix_unit_classroom", "classroom_id"),)


class Lesson(TimestampMixin, Base):
    __tablename__ = "lesson"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    unit_id: Mapped[object] = mapped_column(ForeignKey("content_unit.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    content_type: Mapped[str] = mapped_column(String(30), nullable=False, default="text")
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    author_id: Mapped[object | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))

    __table_args__ = (Index("ix_lesson_unit", "unit_id"),)


class Resource(TimestampMixin, Base):
    __tablename__ = "resource"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    lesson_id: Mapped[object | None] = mapped_column(ForeignKey("lesson.id", ondelete="CASCADE"))
    classroom_id: Mapped[object | None] = mapped_column(ForeignKey("classroom.id", ondelete="CASCADE"))
    course_id: Mapped[object | None] = mapped_column(ForeignKey("course.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(30), nullable=False, default="document")
    url: Mapped[str | None] = mapped_column(String(1000))
    file_name: Mapped[str | None] = mapped_column(String(255))
    file_size: Mapped[int | None] = mapped_column(Integer)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="published")
    created_by: Mapped[object | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))

    __table_args__ = (Index("ix_resource_lesson", "lesson_id"),)


class CourseEnrollment(TimestampMixin, Base):
    __tablename__ = "course_enrollment"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    student_id: Mapped[object] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    course_id: Mapped[object] = mapped_column(ForeignKey("course.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    enrolled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)

    __table_args__ = (
        UniqueConstraint("student_id", "course_id", name="uq_course_enrollment"),
        Index("ix_ce_student", "student_id"),
        Index("ix_ce_course", "course_id"),
    )


class ClassroomEnrollment(TimestampMixin, Base):
    __tablename__ = "classroom_enrollment"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    student_id: Mapped[object] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    classroom_id: Mapped[object] = mapped_column(ForeignKey("classroom.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    enrolled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)

    __table_args__ = (
        UniqueConstraint("student_id", "classroom_id", name="uq_classroom_enrollment"),
        Index("ix_cle_student", "student_id"),
        Index("ix_cle_classroom", "classroom_id"),
    )


class TeacherAssignment(TimestampMixin, Base):
    __tablename__ = "teacher_assignment"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    teacher_id: Mapped[object] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    course_id: Mapped[object | None] = mapped_column(ForeignKey("course.id", ondelete="CASCADE"))
    classroom_id: Mapped[object | None] = mapped_column(ForeignKey("classroom.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(40), nullable=False, default="primary")
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)

    __table_args__ = (Index("ix_ta_teacher", "teacher_id"),)


class Grade(TimestampMixin, Base):
    __tablename__ = "grade"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    student_id: Mapped[object] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    classroom_id: Mapped[object] = mapped_column(ForeignKey("classroom.id", ondelete="CASCADE"), nullable=False)
    lesson_id: Mapped[object | None] = mapped_column(ForeignKey("lesson.id", ondelete="SET NULL"))
    assessment_name: Mapped[str] = mapped_column(String(200), nullable=False)
    score: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    max_score: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False, default=100)
    observations: Mapped[str | None] = mapped_column(Text)
    graded_by: Mapped[object | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    graded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)

    __table_args__ = (Index("ix_grade_student", "student_id"), Index("ix_grade_classroom", "classroom_id"))


class Announcement(TimestampMixin, Base):
    __tablename__ = "announcement"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    author_id: Mapped[object | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    course_id: Mapped[object | None] = mapped_column(ForeignKey("course.id", ondelete="CASCADE"))
    classroom_id: Mapped[object | None] = mapped_column(ForeignKey("classroom.id", ondelete="CASCADE"))
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)
    target_role: Mapped[str | None] = mapped_column(String(30))
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    __table_args__ = (Index("ix_ann_classroom", "classroom_id"),)


class LessonProgress(TimestampMixin, Base):
    __tablename__ = "lesson_progress"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    student_id: Mapped[object] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    lesson_id: Mapped[object] = mapped_column(ForeignKey("lesson.id", ondelete="CASCADE"), nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    progress_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("student_id", "lesson_id", name="uq_lesson_progress"),
        Index("ix_lp_student", "student_id"),
    )


class ActivityLog(Base):
    __tablename__ = "activity_log"

    id: Mapped[object] = mapped_column(UUID7, primary_key=True, default=uuid7)
    user_id: Mapped[object | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(64))
    details: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)

    __table_args__ = (Index("ix_al_user", "user_id"), Index("ix_al_created", "created_at"))
