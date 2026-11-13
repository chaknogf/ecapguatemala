from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# ---- Course ----
class CourseCreate(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=200)
    description: str | None = None
    objectives: str | None = None
    cover_image: str | None = None
    category_id: uuid.UUID | None = None
    duration_hours: int | None = None
    level: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: str = "draft"
    visibility: str = "private"
    responsible_teacher_id: uuid.UUID | None = None


class CourseUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    description: str | None = None
    objectives: str | None = None
    cover_image: str | None = None
    category_id: uuid.UUID | None = None
    duration_hours: int | None = None
    level: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: str | None = None
    visibility: str | None = None
    responsible_teacher_id: uuid.UUID | None = None


class CourseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    code: str
    name: str
    description: str | None
    objectives: str | None
    cover_image: str | None
    category_id: uuid.UUID | None
    duration_hours: int | None
    level: str | None
    start_date: date | None
    end_date: date | None
    status: str
    visibility: str
    responsible_teacher_id: uuid.UUID | None
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


# ---- Category ----
class CategoryCreate(BaseModel):
    name: str
    description: str | None = None


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime


# ---- Classroom ----
class ClassroomCreate(BaseModel):
    course_id: uuid.UUID
    name: str = Field(min_length=2, max_length=200)
    description: str | None = None
    teacher_id: uuid.UUID | None = None
    start_date: date | None = None
    end_date: date | None = None
    max_capacity: int | None = None
    status: str = "active"
    modality: str | None = None
    meeting_link: str | None = None


class ClassroomUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    teacher_id: uuid.UUID | None = None
    start_date: date | None = None
    end_date: date | None = None
    max_capacity: int | None = None
    status: str | None = None
    modality: str | None = None
    meeting_link: str | None = None


class ClassroomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    course_id: uuid.UUID
    name: str
    description: str | None
    teacher_id: uuid.UUID | None
    start_date: date | None
    end_date: date | None
    max_capacity: int | None
    status: str
    modality: str | None
    meeting_link: str | None
    created_at: datetime
    updated_at: datetime


# ---- ContentUnit ----
class UnitCreate(BaseModel):
    classroom_id: uuid.UUID
    title: str
    description: str | None = None
    order_index: int = 0
    status: str = "draft"


class UnitUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    order_index: int | None = None
    status: str | None = None


class UnitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    classroom_id: uuid.UUID
    title: str
    description: str | None
    order_index: int
    status: str
    created_at: datetime
    updated_at: datetime


# ---- Lesson ----
class LessonCreate(BaseModel):
    unit_id: uuid.UUID
    title: str
    description: str | None = None
    content_type: str = "text"
    order_index: int = 0
    status: str = "draft"


class LessonUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    content_type: str | None = None
    order_index: int | None = None
    status: str | None = None


class LessonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    unit_id: uuid.UUID
    title: str
    description: str | None
    content_type: str
    order_index: int
    status: str
    published_at: datetime | None
    author_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


# ---- Resource ----
class ResourceCreate(BaseModel):
    lesson_id: uuid.UUID | None = None
    classroom_id: uuid.UUID | None = None
    course_id: uuid.UUID | None = None
    title: str
    description: str | None = None
    type: str = "document"
    url: str | None = None
    file_name: str | None = None
    file_size: int | None = None
    order_index: int = 0
    visibility: str = "published"


class ResourceUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    type: str | None = None
    url: str | None = None
    file_name: str | None = None
    file_size: int | None = None
    order_index: int | None = None
    visibility: str | None = None


class ResourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    lesson_id: uuid.UUID | None
    classroom_id: uuid.UUID | None
    course_id: uuid.UUID | None
    title: str
    description: str | None
    type: str
    url: str | None
    file_name: str | None
    file_size: int | None
    order_index: int
    visibility: str
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


# ---- Enrollments ----
class EnrollStudentCourse(BaseModel):
    student_id: uuid.UUID
    course_id: uuid.UUID


class EnrollStudentClassroom(BaseModel):
    student_id: uuid.UUID
    classroom_id: uuid.UUID


class EnrollmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    student_id: uuid.UUID
    course_id: uuid.UUID | None = None
    classroom_id: uuid.UUID | None = None
    status: str
    enrolled_at: datetime


# ---- TeacherAssignment ----
class TeacherAssignCreate(BaseModel):
    teacher_id: uuid.UUID
    course_id: uuid.UUID | None = None
    classroom_id: uuid.UUID | None = None
    role: str = "primary"


class TeacherAssignOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    teacher_id: uuid.UUID
    course_id: uuid.UUID | None
    classroom_id: uuid.UUID | None
    role: str
    assigned_at: datetime


# ---- Grade ----
class GradeCreate(BaseModel):
    student_id: uuid.UUID
    classroom_id: uuid.UUID
    lesson_id: uuid.UUID | None = None
    assessment_name: str
    score: float
    max_score: float = 100
    observations: str | None = None


class GradeUpdate(BaseModel):
    score: float | None = None
    max_score: float | None = None
    observations: str | None = None
    assessment_name: str | None = None


class GradeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    student_id: uuid.UUID
    classroom_id: uuid.UUID
    lesson_id: uuid.UUID | None
    assessment_name: str
    score: float
    max_score: float
    observations: str | None
    graded_by: uuid.UUID | None
    graded_at: datetime
    created_at: datetime
    updated_at: datetime


# ---- Announcement ----
class AnnouncementCreate(BaseModel):
    title: str
    content: str
    course_id: uuid.UUID | None = None
    classroom_id: uuid.UUID | None = None
    target_role: str | None = None
    pinned: bool = False


class AnnouncementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    title: str
    content: str
    author_id: uuid.UUID | None
    course_id: uuid.UUID | None
    classroom_id: uuid.UUID | None
    published_at: datetime
    target_role: str | None
    pinned: bool
    created_at: datetime
    updated_at: datetime


# ---- Progress ----
class ProgressUpdate(BaseModel):
    lesson_id: uuid.UUID
    student_id: uuid.UUID
    completed: bool = False
    progress_pct: int = 0


class ProgressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    student_id: uuid.UUID
    lesson_id: uuid.UUID
    completed: bool
    progress_pct: int
    last_viewed_at: datetime | None
    created_at: datetime
    updated_at: datetime


# ---- Stats ----
class DashboardStats(BaseModel):
    total_students: int
    total_teachers: int
    total_courses: int
    total_classrooms: int
    active_courses: int
    finished_courses: int
    total_enrollments: int
    recent_activity: list[dict[str, Any]] = []
